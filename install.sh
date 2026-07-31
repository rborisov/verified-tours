#!/usr/bin/env bash
# VPS installer — host Node.js + systemd (no Docker). Suitable for 1 GB RAM with swap.
set -euo pipefail

INSTALL_ROOT=/opt/verified-tours
BUILD_ROOT=/var/tmp/verified-tours-build
REPO_URL=https://github.com/rborisov/verified-tours.git
MARKER="${INSTALL_ROOT}/.installed"
DATA_DIR="${INSTALL_ROOT}/data"
WORKSPACE_DIR="${INSTALL_ROOT}/workspace"
NGINX_SITE=/etc/nginx/sites-available/verified-tours
MCP_JSON="${INSTALL_ROOT}/mcp.json"
MCP_HOME_JSON=/root/.cursor/mcp.json
INSTALL_DOMAIN_FILE="${INSTALL_ROOT}/.install-domain"
INSTALL_REV_FILE="${INSTALL_ROOT}/.install-rev"
WEB_UNIT=/etc/systemd/system/verified-tours-web.service
WORKER_UNIT=/etc/systemd/system/verified-tours-worker.service
SWAPFILE=/swapfile
SWAP_SIZE_GB=2
# Peak for npm ci + next build on this monorepo (~1.5–2.0 GiB) + headroom.
MIN_FREE_BUILD_MB=2200
# After reclaim, refuse below this — build will almost certainly fail.
MIN_FREE_HARD_MB=1800
SIBLING_BUILD_ROOT=/var/tmp/newsdigest-build

ensure_data_dirs() {
  mkdir -p "${DATA_DIR}/logs"
}

DOMAIN=""
LE_EMAIL=""
ALLOWED_EMAILS=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
YANDEX_CLIENT_ID=""
YANDEX_CLIENT_SECRET=""
CURSOR_API_KEY=""
NEXTAUTH_URL=""
NEXTAUTH_SECRET=""
INTERNAL_API_KEY=""
RECONFIGURE=0

log()  { printf '==> %s\n' "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
need_cmd() { command -v "$1" >/dev/null 2>&1 || die "missing command: $1"; }

require_root() {
  [[ "${EUID}" -eq 0 ]] || die "Run as root (sudo -i, then re-run)."
}

require_ubuntu() {
  [[ -f /etc/os-release ]] || die "Cannot detect OS."
  # shellcheck source=/dev/null
  . /etc/os-release
  [[ "${ID:-}" == "ubuntu" ]] || die "Ubuntu 22.04/24.04 required (got ID=${ID:-unknown})."
  case "${VERSION_ID:-}" in
    22.04|24.04) ;;
    *) die "Ubuntu 22.04/24.04 required (got ${VERSION_ID:-unknown})." ;;
  esac
}

is_installed() {
  [[ -f "${MARKER}" && -f "${WEB_UNIT}" && -f "${INSTALL_ROOT}/apps/web/.next/standalone/apps/web/server.js" ]]
}

prompt() {
  local __var="$1" __q="$2" __d="${3:-}" __ans
  if [[ -n "${__d}" ]]; then
    read -r -p "${__q} [${__d}]: " __ans </dev/tty || true
    __ans="${__ans:-${__d}}"
  else
    read -r -p "${__q}: " __ans </dev/tty || true
  fi
  printf -v "${__var}" '%s' "${__ans}"
}

prompt_secret() {
  local __var="$1" __q="$2" __d="${3:-}" __ans
  if [[ -n "${__d}" ]]; then
    read -r -s -p "${__q} [keep existing if blank]: " __ans </dev/tty || true
    echo
    __ans="${__ans:-${__d}}"
  else
    read -r -s -p "${__q}: " __ans </dev/tty || true
    echo
  fi
  printf -v "${__var}" '%s' "${__ans}"
}

gen_secret() {
  openssl rand -hex 32
}

ensure_apt_packages() {
  local pkgs=("$@") missing=()
  local p
  for p in "${pkgs[@]}"; do
    if ! dpkg -s "${p}" >/dev/null 2>&1; then
      missing+=("${p}")
    fi
  done
  if [[ "${#missing[@]}" -gt 0 ]]; then
    log "Installing apt packages: ${missing[*]}"
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${missing[@]}"
  fi
}

# 1 GB boxes need swap for `next build`; runtime fits in ~512–800 MB.
# Creating a 2G swapfile needs free disk — reclaim first on tiny VPS disks.
disk_avail_mb() {
  df -Pm / | awk 'NR==2 {print $4}'
}

log_disk() {
  local avail
  avail="$(disk_avail_mb)"
  log "Disk: $(df -h / | awk 'NR==2 {printf "size=%s used=%s avail=%s (%s)", $2, $3, $4, $5}') · ${avail} MiB free"
  du -sh /opt/newsdigest /opt/verified-tours /var/tmp/newsdigest-build /var/tmp/verified-tours-build /var/cache/apt 2>/dev/null || true
}

reclaim_disk_space() {
  log "Reclaiming disk before build (10G hosts with newsdigest need this)"
  apt-get clean >/dev/null 2>&1 || true
  rm -rf /var/cache/apt/archives/*.deb 2>/dev/null || true
  journalctl --vacuum-size=40M >/dev/null 2>&1 || true
  npm cache clean --force >/dev/null 2>&1 || true
  rm -rf /root/.npm/_cacache 2>/dev/null || true

  # Drop our own previous heavy build artifacts (git kept for shallow fetch).
  if [[ -d "${BUILD_ROOT}" ]]; then
    log "Pruning previous ${BUILD_ROOT} node_modules / .next"
    rm -rf \
      "${BUILD_ROOT}/node_modules" \
      "${BUILD_ROOT}/apps/web/node_modules" \
      "${BUILD_ROOT}/apps/web/.next" \
      "${BUILD_ROOT}/apps/worker/dist" \
      "${BUILD_ROOT}/apps/mcp-server/dist" \
      "${BUILD_ROOT}/.install-npm-hash" \
      "${BUILD_ROOT}/.install-build-rev" 2>/dev/null || true
  fi

  # Sibling newsdigest build cache is usually the largest reclaimable chunk.
  if [[ -d "${SIBLING_BUILD_ROOT}" ]]; then
    local sibling_mb=0
    sibling_mb="$(du -sm "${SIBLING_BUILD_ROOT}" 2>/dev/null | awk '{print $1}')"
    log "Found sibling build cache ${SIBLING_BUILD_ROOT} (~${sibling_mb} MiB)"
    if [[ "$(disk_avail_mb)" -lt "${MIN_FREE_BUILD_MB}" ]]; then
      log "Freeing sibling build cache (newsdigest runtime under /opt/newsdigest is untouched)"
      rm -rf \
        "${SIBLING_BUILD_ROOT}/node_modules" \
        "${SIBLING_BUILD_ROOT}/apps/web/.next" \
        "${SIBLING_BUILD_ROOT}/.install-npm-hash" \
        "${SIBLING_BUILD_ROOT}/.install-build-rev" 2>/dev/null || true
      # If still tight, remove entire sibling build tree (rebuilt on next newsdigest update).
      if [[ "$(disk_avail_mb)" -lt "${MIN_FREE_BUILD_MB}" ]]; then
        log "Still low on space — removing entire ${SIBLING_BUILD_ROOT}"
        rm -rf "${SIBLING_BUILD_ROOT}"
      fi
    fi
  fi

  log_disk
}

require_disk_for_build() {
  log_disk
  local avail
  avail="$(disk_avail_mb)"
  if [[ "${avail}" -ge "${MIN_FREE_BUILD_MB}" ]]; then
    log "Disk OK for build (≥ ${MIN_FREE_BUILD_MB} MiB free)"
    return 0
  fi

  log "Only ${avail} MiB free — need ~${MIN_FREE_BUILD_MB} MiB for npm ci + next build"
  reclaim_disk_space
  avail="$(disk_avail_mb)"
  if [[ "${avail}" -lt "${MIN_FREE_HARD_MB}" ]]; then
    die "Not enough disk after reclaim (${avail} MiB free, need ≥ ${MIN_FREE_HARD_MB} MiB). Free space manually (old logs, unused packages, enlarge disk), then re-run. Tip: du -xh / --max-depth=2 | sort -h | tail"
  fi
  if [[ "${avail}" -lt "${MIN_FREE_BUILD_MB}" ]]; then
    log "WARNING: ${avail} MiB free is below ideal ${MIN_FREE_BUILD_MB} MiB — build may still fail; continuing"
  else
    log "Disk OK after reclaim (${avail} MiB free)"
  fi
}

prune_build_tree_after_stage() {
  # Keep shallow git for faster updates; drop heavy artifacts so 10G disks stay usable.
  if [[ ! -d "${BUILD_ROOT}" ]]; then
    return 0
  fi
  log "Pruning build tree after staging runtime (keeps .git only)"
  rm -rf \
    "${BUILD_ROOT}/node_modules" \
    "${BUILD_ROOT}/apps/web/node_modules" \
    "${BUILD_ROOT}/apps/web/.next" \
    "${BUILD_ROOT}/apps/worker/node_modules" \
    "${BUILD_ROOT}/apps/mcp-server/node_modules" \
    "${BUILD_ROOT}/apps/worker/dist" \
    "${BUILD_ROOT}/apps/mcp-server/dist" \
    "${BUILD_ROOT}/.install-npm-hash" \
    "${BUILD_ROOT}/.install-build-rev" 2>/dev/null || true
  npm cache clean --force >/dev/null 2>&1 || true
  du -sh "${BUILD_ROOT}" "${INSTALL_ROOT}" 2>/dev/null || true
  log_disk
}

ensure_swap() {
  local mem_kb swap_kb avail_mb
  mem_kb="$(awk '/MemTotal:/ {print $2}' /proc/meminfo)"
  swap_kb="$(awk '/SwapTotal:/ {print $2}' /proc/meminfo)"
  if [[ "${mem_kb}" -ge 1800000 ]]; then
    log "RAM ≥ ~1.8 GiB — swap not required for build"
    return 0
  fi
  if [[ "${swap_kb}" -ge 1000000 ]]; then
    log "Swap already present ($(awk '/SwapTotal:/ {printf "%.1f GiB", $2/1024/1024}' /proc/meminfo))"
    return 0
  fi

  avail_mb="$(disk_avail_mb)"
  local want_gb="${SWAP_SIZE_GB}"
  # Need swap file + remaining build headroom; shrink swap if disk is tiny.
  if [[ "${avail_mb}" -lt $((want_gb * 1024 + MIN_FREE_HARD_MB)) ]]; then
    if [[ "${avail_mb}" -ge $((1024 + MIN_FREE_HARD_MB)) ]]; then
      want_gb=1
      log "Low disk (${avail_mb} MiB free) — creating ${want_gb}G swap instead of ${SWAP_SIZE_GB}G"
    else
      log "WARNING: not enough free disk for a new swapfile (${avail_mb} MiB). Relying on existing RAM; build may OOM."
      return 0
    fi
  fi

  log "Low RAM (${mem_kb} kB) — creating ${want_gb}G swap at ${SWAPFILE}"
  if [[ ! -f "${SWAPFILE}" ]]; then
    fallocate -l "${want_gb}G" "${SWAPFILE}" 2>/dev/null \
      || dd if=/dev/zero of="${SWAPFILE}" bs=1M count=$((want_gb * 1024)) status=none
    chmod 600 "${SWAPFILE}"
    mkswap "${SWAPFILE}" >/dev/null
  fi
  swapon "${SWAPFILE}" 2>/dev/null || true
  if ! grep -q "${SWAPFILE}" /etc/fstab 2>/dev/null; then
    echo "${SWAPFILE} none swap sw 0 0" >> /etc/fstab
  fi
  swapon --show || true
}

install_node22() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
    if [[ "${major}" -ge 22 ]]; then
      log "Node.js $(node -v) already installed"
      return 0
    fi
    log "Node $(node -v) is too old; installing Node.js 22"
  else
    log "Installing Node.js 22"
  fi
  ensure_apt_packages ca-certificates curl gnupg
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
  need_cmd node
  need_cmd npm
  log "Node.js $(node -v) / npm $(npm -v)"
}

install_packages() {
  log "Ensuring system packages (no Docker)"
  log_disk
  if [[ "$(disk_avail_mb)" -lt "${MIN_FREE_BUILD_MB}" ]]; then
    reclaim_disk_space
  fi
  ensure_apt_packages ca-certificates curl git openssl nginx certbot python3-certbot-nginx build-essential python3
  ensure_swap
  install_node22
  systemctl enable --now nginx
  systemctl is-active --quiet nginx || die "nginx.service failed to start"
}

# Shallow clone into a disposable build tree (not the runtime root).
ensure_build_tree() {
  mkdir -p "$(dirname "${BUILD_ROOT}")"
  if [[ -d "${BUILD_ROOT}/.git" ]]; then
    log "Updating build cache at ${BUILD_ROOT} (keeps node_modules)"
    git -C "${BUILD_ROOT}" remote set-url origin "${REPO_URL}"
    git -C "${BUILD_ROOT}" fetch --depth 1 origin main
    # Hard reset tracked files only — leaves node_modules / .next cache intact
    git -C "${BUILD_ROOT}" reset --hard FETCH_HEAD
  else
    log "Cloning build cache into ${BUILD_ROOT} (kept across updates)"
    rm -rf "${BUILD_ROOT}"
    git clone --depth 1 --branch main "${REPO_URL}" "${BUILD_ROOT}"
  fi
}

# Keep only what systemd / MCP / Cursor need under INSTALL_ROOT.
stage_runtime_from_build() {
  local rev
  rev="$(git -C "${BUILD_ROOT}" rev-parse --short HEAD)"
  log "Staging slim runtime → ${INSTALL_ROOT} (rev ${rev})"

  mkdir -p \
    "${INSTALL_ROOT}/apps/web/.next" \
    "${INSTALL_ROOT}/apps/worker" \
    "${INSTALL_ROOT}/apps/mcp-server" \
    "${INSTALL_ROOT}/apps/web/prisma" \
    "${DATA_DIR}" \
    "${WORKSPACE_DIR}"

  # Web: Next standalone only
  rm -rf "${INSTALL_ROOT}/apps/web/.next/standalone"
  cp -a "${BUILD_ROOT}/apps/web/.next/standalone" "${INSTALL_ROOT}/apps/web/.next/standalone"

  # Worker + MCP: compiled JS + package.json (prod install next)
  rm -rf "${INSTALL_ROOT}/apps/worker/dist" "${INSTALL_ROOT}/apps/mcp-server/dist"
  cp -a "${BUILD_ROOT}/apps/worker/dist" "${INSTALL_ROOT}/apps/worker/dist"
  cp -a "${BUILD_ROOT}/apps/mcp-server/dist" "${INSTALL_ROOT}/apps/mcp-server/dist"
  cp -f "${BUILD_ROOT}/apps/worker/package.json" "${INSTALL_ROOT}/apps/worker/package.json"
  cp -f "${BUILD_ROOT}/apps/mcp-server/package.json" "${INSTALL_ROOT}/apps/mcp-server/package.json"

  # Prisma schema for generate / future db ops
  cp -f "${BUILD_ROOT}/apps/web/prisma/schema.prisma" "${INSTALL_ROOT}/apps/web/prisma/schema.prisma"
  cp -f "${BUILD_ROOT}/apps/web/prisma/seed.ts" "${INSTALL_ROOT}/apps/web/prisma/seed.ts"
  # Copy under worker too so `prisma generate` project-root = worker (has package.json)
  mkdir -p "${INSTALL_ROOT}/apps/worker/prisma"
  cp -f "${BUILD_ROOT}/apps/web/prisma/schema.prisma" "${INSTALL_ROOT}/apps/worker/prisma/schema.prisma"

  # Minimal root manifest so tooling does not invent /opt/verified-tours/apps as a package root
  cat > "${INSTALL_ROOT}/package.json" <<'EOF'
{
  "name": "verified-tours",
  "private": true,
  "description": "Slim VPS runtime — not a full monorepo checkout"
}
EOF

  # Tiny marker README in agent workspace (no app source)
  cat > "${WORKSPACE_DIR}/README.md" <<'EOF'
Cursor agent workspace for verified-tours. Tours are published via MCP; do not store secrets here.
EOF

  printf '%s\n' "${rev}" > "${INSTALL_REV_FILE}"

  # Drop leftover full-tree clutter from older installs
  rm -rf \
    "${INSTALL_ROOT}/.git" \
    "${INSTALL_ROOT}/docs" \
    "${INSTALL_ROOT}/node_modules" \
    "${INSTALL_ROOT}/apps/node_modules" \
    "${INSTALL_ROOT}/apps/package.json" \
    "${INSTALL_ROOT}/apps/package-lock.json" \
    "${INSTALL_ROOT}/apps/web/src" \
    "${INSTALL_ROOT}/apps/web/node_modules" \
    "${INSTALL_ROOT}/apps/web/.next/cache" \
    "${INSTALL_ROOT}/package-lock.json" \
    "${INSTALL_ROOT}/docker-compose.yml" \
    "${INSTALL_ROOT}/docker-compose.override.yml" \
    "${INSTALL_ROOT}/.dockerignore" \
    "${INSTALL_ROOT}/README.md" \
    "${INSTALL_ROOT}/install.sh" \
    "${INSTALL_ROOT}/.env.example" \
    "${INSTALL_ROOT}/apps/web/Dockerfile" \
    "${INSTALL_ROOT}/apps/worker/Dockerfile" \
    "${INSTALL_ROOT}/apps/worker/src" \
    "${INSTALL_ROOT}/apps/mcp-server/src" \
    "${INSTALL_ROOT}/apps/web/public" \
    "${INSTALL_ROOT}/apps/web/tsconfig.json" \
    "${INSTALL_ROOT}/apps/web/next.config.ts" \
    "${INSTALL_ROOT}/apps/web/eslint.config.mjs" \
    "${INSTALL_ROOT}/apps/web/next-env.d.ts" \
    "${INSTALL_ROOT}/apps/web/CLAUDE.md" \
    "${INSTALL_ROOT}/apps/web/AGENTS.md" \
    "${INSTALL_ROOT}/apps/web/README.md" || true

  # Old .next leftovers besides standalone
  if [[ -d "${INSTALL_ROOT}/apps/web/.next" ]]; then
    find "${INSTALL_ROOT}/apps/web/.next" -mindepth 1 -maxdepth 1 ! -name standalone -exec rm -rf {} +
  fi
}

install_runtime_node_deps() {
  log "Installing production deps for worker + MCP only"
  local hash_file="${INSTALL_ROOT}/.install-runtime-deps-hash"
  local pkgs_hash
  pkgs_hash="$(
    {
      sha256sum "${INSTALL_ROOT}/apps/worker/package.json"
      sha256sum "${INSTALL_ROOT}/apps/mcp-server/package.json"
    } | sha256sum | awk '{print $1}'
  )"

  if [[ -d "${INSTALL_ROOT}/apps/worker/node_modules" ]] \
    && [[ -d "${INSTALL_ROOT}/apps/mcp-server/node_modules" ]] \
    && [[ -f "${hash_file}" ]] \
    && [[ "$(cat "${hash_file}" 2>/dev/null || true)" == "${pkgs_hash}" ]]; then
    log "Runtime package.json unchanged — skipping prod npm install"
    return 0
  fi

  (
    cd "${INSTALL_ROOT}/apps/worker"
    # Ignore postinstall (it points at ../web schema and confuses Prisma project root)
    npm install --omit=dev --ignore-scripts --no-audit --no-fund
    npx prisma generate --schema=prisma/schema.prisma
  )
  (
    cd "${INSTALL_ROOT}/apps/mcp-server"
    npm install --omit=dev --ignore-scripts --no-audit --no-fund
  )
  printf '%s\n' "${pkgs_hash}" > "${hash_file}"
}

load_env_defaults() {
  local env_file="${INSTALL_ROOT}/.env"
  [[ -f "${env_file}" ]] || return 0

  local line key val
  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "${line}" || "${line}" == \#* ]] && continue
    [[ "${line}" == *=* ]] || continue
    key="${line%%=*}"
    val="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    [[ "${key}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ "${val}" =~ ^\"(.*)\"$ ]]; then
      val="${BASH_REMATCH[1]}"
    elif [[ "${val}" =~ ^\'(.*)\'$ ]]; then
      val="${BASH_REMATCH[1]}"
    fi
    case "${key}" in
      DOMAIN) DOMAIN="${val}" ;;
      LE_EMAIL) LE_EMAIL="${val}" ;;
      ALLOWED_EMAILS) ALLOWED_EMAILS="${val}" ;;
      GOOGLE_CLIENT_ID) GOOGLE_CLIENT_ID="${val}" ;;
      GOOGLE_CLIENT_SECRET) GOOGLE_CLIENT_SECRET="${val}" ;;
      YANDEX_CLIENT_ID) YANDEX_CLIENT_ID="${val}" ;;
      YANDEX_CLIENT_SECRET) YANDEX_CLIENT_SECRET="${val}" ;;
      CURSOR_API_KEY) CURSOR_API_KEY="${val}" ;;
      NEXTAUTH_SECRET) NEXTAUTH_SECRET="${val}" ;;
      INTERNAL_API_KEY) INTERNAL_API_KEY="${val}" ;;
      NEXTAUTH_URL)
        NEXTAUTH_URL="${val}"
        if [[ -z "${DOMAIN}" ]]; then
          val="${val#https://}"
          val="${val#http://}"
          val="${val%%/*}"
          DOMAIN="${val}"
        fi
        ;;
    esac
  done < "${env_file}"
}

prompt_config() {
  prompt DOMAIN "Domain (FQDN)" "${DOMAIN}"
  [[ -n "${DOMAIN}" ]] || die "DOMAIN is required."

  prompt LE_EMAIL "Let's Encrypt email" "${LE_EMAIL}"
  [[ -n "${LE_EMAIL}" ]] || die "LE_EMAIL is required."

  prompt ALLOWED_EMAILS "Allowed admin emails (comma-separated)" "${ALLOWED_EMAILS}"
  [[ -n "${ALLOWED_EMAILS}" ]] || die "ALLOWED_EMAILS is required."

  prompt GOOGLE_CLIENT_ID "Google OAuth client ID (optional)" "${GOOGLE_CLIENT_ID}"
  prompt_secret GOOGLE_CLIENT_SECRET "Google OAuth client secret (optional)" "${GOOGLE_CLIENT_SECRET}"

  prompt YANDEX_CLIENT_ID "Yandex OAuth client ID (optional)" "${YANDEX_CLIENT_ID}"
  prompt_secret YANDEX_CLIENT_SECRET "Yandex OAuth client secret (optional)" "${YANDEX_CLIENT_SECRET}"

  local google_ok=0 yandex_ok=0
  if [[ -n "${GOOGLE_CLIENT_ID}" && -n "${GOOGLE_CLIENT_SECRET}" ]]; then
    google_ok=1
  fi
  if [[ -n "${YANDEX_CLIENT_ID}" && -n "${YANDEX_CLIENT_SECRET}" ]]; then
    yandex_ok=1
  fi
  if [[ "${google_ok}" -eq 0 && "${yandex_ok}" -eq 0 ]]; then
    die "Configure at least one full OAuth provider (Google or Yandex client id + secret)."
  fi

  prompt_secret CURSOR_API_KEY "Cursor API key" "${CURSOR_API_KEY}"
  [[ -n "${CURSOR_API_KEY}" ]] || die "CURSOR_API_KEY is required."

  if [[ -z "${NEXTAUTH_SECRET}" ]]; then
    NEXTAUTH_SECRET="$(gen_secret)"
    log "Generated NEXTAUTH_SECRET"
  fi
  if [[ -z "${INTERNAL_API_KEY}" ]]; then
    INTERNAL_API_KEY="$(gen_secret)"
    log "Generated INTERNAL_API_KEY"
  fi

  NEXTAUTH_URL="https://${DOMAIN}"
}

write_env() {
  local env_file="${INSTALL_ROOT}/.env"
  log "Writing ${env_file}"
  ensure_data_dirs
  cat > "${env_file}" <<EOF
# managed-by: verified-tours-install (host / systemd — no Docker)
DOMAIN=${DOMAIN}
LE_EMAIL=${LE_EMAIL}

NEXTAUTH_URL=${NEXTAUTH_URL}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}

GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}

YANDEX_CLIENT_ID=${YANDEX_CLIENT_ID}
YANDEX_CLIENT_SECRET=${YANDEX_CLIENT_SECRET}

ALLOWED_EMAILS=${ALLOWED_EMAILS}

INTERNAL_API_KEY=${INTERNAL_API_KEY}

CURSOR_API_KEY=${CURSOR_API_KEY}
CURSOR_CLI_PATH=/usr/local/bin/agent
AGENT_WORKSPACE=${WORKSPACE_DIR}
AGENT_MUTEX_PATH=/var/lock/cursor-agent.lock

# Absolute SQLite path (host)
DATABASE_URL=file:${DATA_DIR}/tours.db

# Worker → portal
PORTAL_URL=http://127.0.0.1:3001

DISK_ALERT_USED_PCT=85
DISK_ALERT_COOLDOWN_HOURS=6
# DISK_ALERT_WEBHOOK_URL=
EOF
  chmod 600 "${env_file}"
}

install_cursor_cli() {
  # On updates: keep existing agent; only install if missing.
  if [[ -x /usr/local/bin/agent ]] || [[ -x /root/.local/bin/agent ]]; then
    local agent_src=""
    if [[ -x /usr/local/bin/agent ]]; then
      agent_src=/usr/local/bin/agent
    else
      agent_src=/root/.local/bin/agent
      ln -sfn "${agent_src}" /usr/local/bin/agent
    fi
    if /usr/local/bin/agent --version >/dev/null 2>&1; then
      log "Cursor CLI already present ($(/usr/local/bin/agent --version 2>/dev/null | head -1)); skipping download"
      return 0
    fi
  fi

  log "Installing Cursor CLI"
  curl -fsS https://cursor.com/install | bash
  local agent_src=""
  if [[ -x /root/.local/bin/agent ]]; then
    agent_src=/root/.local/bin/agent
  elif command -v agent >/dev/null 2>&1; then
    agent_src="$(command -v agent)"
  else
    die "Cursor CLI installed but 'agent' not found on PATH."
  fi
  ln -sfn "${agent_src}" /usr/local/bin/agent
  /usr/local/bin/agent --version || die "agent --version failed"
}

write_mcp_json() {
  log "Writing MCP config ${MCP_JSON} (merge into ${MCP_HOME_JSON})"
  if [[ -z "${INTERNAL_API_KEY}" ]]; then
    load_env_defaults
  fi
  [[ -n "${INTERNAL_API_KEY}" ]] || die "INTERNAL_API_KEY is required for MCP config."

  local key_json
  key_json="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "${INTERNAL_API_KEY}")"

  mkdir -p /root/.cursor

  # Product-local MCP file (verified-tours only)
  cat > "${MCP_JSON}" <<EOF
{
  "mcpServers": {
    "verified-tours": {
      "command": "/usr/bin/node",
      "args": ["${INSTALL_ROOT}/apps/mcp-server/dist/index.js"],
      "env": {
        "PORTAL_URL": "http://127.0.0.1:3001",
        "INTERNAL_API_KEY": ${key_json}
      }
    }
  }
}
EOF
  chmod 0644 "${MCP_JSON}"

  # Merge into ~/.cursor/mcp.json — never wipe sibling servers (e.g. news-digest)
  python3 - "${MCP_JSON}" "${MCP_HOME_JSON}" <<'PY'
import json, sys
from pathlib import Path

src_path = Path(sys.argv[1])
dst_path = Path(sys.argv[2])
src = json.loads(src_path.read_text())
vt = src["mcpServers"]["verified-tours"]

if dst_path.is_file():
    try:
        dst = json.loads(dst_path.read_text())
    except Exception:
        dst = {"mcpServers": {}}
else:
    dst = {"mcpServers": {}}

if not isinstance(dst.get("mcpServers"), dict):
    dst["mcpServers"] = {}

dst["mcpServers"]["verified-tours"] = vt
dst_path.write_text(json.dumps(dst, indent=2) + "\n")
PY
  chmod 0644 "${MCP_HOME_JSON}"

  write_cursor_cli_automation_config

  # Best-effort: approve MCP server for CLI (non-fatal if agent not logged in yet)
  if command -v agent >/dev/null 2>&1; then
    agent mcp enable verified-tours >/dev/null 2>&1 || true
  fi
}

# Headless agent jobs need --force-equivalent allowlists: without them, -p silently
# rejects WebFetch/Shell/MCP ("environment blocked") and sandbox blocks 127.0.0.1.
# Merge Write / readonly paths so newsdigest + verified-tours coexist on one host.
write_cursor_cli_automation_config() {
  log "Writing Cursor CLI automation permissions (~/.cursor/cli-config.json, merge)"
  mkdir -p /root/.cursor

  python3 <<'PY'
import json
from pathlib import Path

cli_path = Path("/root/.cursor/cli-config.json")
sandbox_path = Path("/root/.cursor/sandbox.json")

required_allow = [
    "Shell(*)",
    "Read(**)",
    "Write(/tmp/**)",
    "Write(/opt/newsdigest/data/**)",
    "Write(/opt/newsdigest/workspace/**)",
    "Write(/opt/verified-tours/data/**)",
    "Write(/opt/verified-tours/workspace/**)",
    "Write(/opt/verified-tours/**)",
    "WebFetch(*)",
    "Mcp(*:*)",
]
required_deny = [
    "Read(**/.env*)",
    "Write(**/.env*)",
    "Write(**/*.pem)",
    "Write(**/*.key)",
]
required_readonly = [
    "/opt/newsdigest",
    "/opt/newsdigest/workspace",
    "/opt/verified-tours",
    "/opt/verified-tours/workspace",
]

def merge_list(existing, required):
    out = []
    seen = set()
    for item in list(existing or []) + list(required):
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out

if cli_path.is_file():
    try:
        cfg = json.loads(cli_path.read_text())
    except Exception:
        cfg = {}
else:
    cfg = {}

perms = cfg.get("permissions") if isinstance(cfg.get("permissions"), dict) else {}
cfg["permissions"] = {
    "allow": merge_list(perms.get("allow"), required_allow),
    "deny": merge_list(perms.get("deny"), required_deny),
}
cli_path.write_text(json.dumps(cfg, indent=2) + "\n")
cli_path.chmod(0o644)

if sandbox_path.is_file():
    try:
        sb = json.loads(sandbox_path.read_text())
    except Exception:
        sb = {}
else:
    sb = {}

np = sb.get("networkPolicy") if isinstance(sb.get("networkPolicy"), dict) else {}
sb["networkPolicy"] = {
    "default": np.get("default") or "allow",
    "allow": merge_list(np.get("allow"), ["127.0.0.1", "localhost", "0.0.0.0/0"]),
}
sb["additionalReadonlyPaths"] = merge_list(sb.get("additionalReadonlyPaths"), required_readonly)
sandbox_path.write_text(json.dumps(sb, indent=2) + "\n")
sandbox_path.chmod(0o644)
PY

  if command -v agent >/dev/null 2>&1; then
    agent sandbox disable >/dev/null 2>&1 || true
  fi
}

write_systemd_units() {
  log "Writing systemd units"
  local standalone_dir="${INSTALL_ROOT}/apps/web/.next/standalone"
  cat > "${WEB_UNIT}" <<EOF
# managed-by: verified-tours-install
[Unit]
Description=Verified Tours portal (Next.js standalone)
After=network.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${standalone_dir}
EnvironmentFile=${INSTALL_ROOT}/.env
Environment=NODE_ENV=production
Environment=HOME=/root
Environment=HOSTNAME=0.0.0.0
Environment=PORT=3001
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/node apps/web/server.js
Restart=on-failure
RestartSec=5
Environment=NODE_OPTIONS=--max-old-space-size=512

[Install]
WantedBy=multi-user.target
EOF

  cat > "${WORKER_UNIT}" <<EOF
# managed-by: verified-tours-install
[Unit]
Description=Verified Tours scheduler worker
After=network.target verified-tours-web.service
Wants=verified-tours-web.service

[Service]
Type=simple
WorkingDirectory=${INSTALL_ROOT}/apps/worker
EnvironmentFile=${INSTALL_ROOT}/.env
Environment=NODE_ENV=production
Environment=HOME=/root
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_OPTIONS=--max-old-space-size=256

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
}

prepare_standalone() {
  local web="${BUILD_ROOT}/apps/web"
  local standalone="${web}/.next/standalone"
  [[ -f "${standalone}/apps/web/server.js" ]] || die "standalone server missing at ${standalone}/apps/web/server.js — build failed?"

  log "Preparing Next.js standalone static assets"
  mkdir -p "${standalone}/apps/web/.next"
  rm -rf "${standalone}/apps/web/.next/static"
  cp -a "${web}/.next/static" "${standalone}/apps/web/.next/static"
  rm -rf "${standalone}/apps/web/public"
  cp -a "${web}/public" "${standalone}/apps/web/public"
}

install_app() {
  log "Building application in ${BUILD_ROOT}"
  cd "${BUILD_ROOT}" || die "Cannot cd to ${BUILD_ROOT}"
  ensure_data_dirs
  mkdir -p "${WORKSPACE_DIR}"

  export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=768}"
  # Point Prisma at the runtime DB while building/seeding
  export DATABASE_URL="file:${DATA_DIR}/tours.db"
  # Seed reads ALLOWED_EMAILS from env — must come from the install .env, not build-tree.
  set -a
  # shellcheck disable=SC1091
  source "${INSTALL_ROOT}/.env"
  set +a
  export DATABASE_URL="file:${DATA_DIR}/tours.db"

  local lock_hash="" lock_file="${BUILD_ROOT}/.install-npm-hash"
  local build_rev_file="${BUILD_ROOT}/.install-build-rev"
  local head_rev
  head_rev="$(git -C "${BUILD_ROOT}" rev-parse HEAD)"

  if [[ -f package-lock.json ]]; then
    lock_hash="$(sha256sum package-lock.json | awk '{print $1}')"
  fi

  if [[ ! -d node_modules ]] \
    || [[ -z "${lock_hash}" ]] \
    || [[ ! -f "${lock_file}" ]] \
    || [[ "$(cat "${lock_file}" 2>/dev/null || true)" != "${lock_hash}" ]]; then
    log "Installing npm dependencies (build tree; package-lock changed or node_modules missing)…"
    npm ci --no-audit --no-fund
    printf '%s\n' "${lock_hash}" > "${lock_file}"
  else
    log "package-lock unchanged — skipping npm ci"
  fi

  log "Generating Prisma client…"
  npx prisma generate --schema=apps/web/prisma/schema.prisma

  # Schema must exist before `next build`: App Router may prerender routes that query Prisma.
  log "Applying database schema + seed…"
  npm run db:push --workspace=web
  # Seed must use INSTALL_ROOT/.env (workspace script points at build-tree ../../.env).
  log "Seeding allowlist from ${INSTALL_ROOT}/.env"
  (
    set -a
    # shellcheck disable=SC1091
    source "${INSTALL_ROOT}/.env"
    set +a
    export DATABASE_URL="file:${DATA_DIR}/tours.db"
    npx tsx apps/web/prisma/seed.ts
  )

  local need_build=0
  if [[ ! -f apps/web/.next/standalone/apps/web/server.js ]] \
    || [[ ! -d apps/worker/dist ]] \
    || [[ ! -d apps/mcp-server/dist ]] \
    || [[ ! -f "${build_rev_file}" ]] \
    || [[ "$(cat "${build_rev_file}" 2>/dev/null || true)" != "${head_rev}" ]]; then
    need_build=1
  fi

  if [[ "${need_build}" -eq 1 ]]; then
    log "Building Next.js standalone (rev ${head_rev})…"
    npm run build --workspace=web
    prepare_standalone

    log "Compiling worker + MCP…"
    npm run build --workspace=worker
    npm run build --workspace=mcp-server
    printf '%s\n' "${head_rev}" > "${build_rev_file}"
  else
    log "Already built at ${head_rev} — skipping compile"
  fi

  stage_runtime_from_build
  install_runtime_node_deps
  prune_build_tree_after_stage

  log "Runtime under ${INSTALL_ROOT}; build tree pruned at ${BUILD_ROOT}"
  du -sh "${INSTALL_ROOT}" "${DATA_DIR}" "${BUILD_ROOT}" 2>/dev/null || true
}

start_services() {
  log "Starting systemd services"
  systemctl enable verified-tours-web verified-tours-worker
  systemctl restart verified-tours-web
  # Give web a moment before worker hits it
  sleep 3
  systemctl restart verified-tours-worker
  systemctl is-active --quiet verified-tours-web || die "verified-tours-web failed. Check: journalctl -u verified-tours-web -n 50 --no-pager"
  systemctl is-active --quiet verified-tours-worker || die "verified-tours-worker failed. Check: journalctl -u verified-tours-worker -n 50 --no-pager"
  log "Services active: verified-tours-web, verified-tours-worker"
}

configure_nginx() {
  [[ -n "${DOMAIN}" ]] || die "DOMAIN is required for nginx."
  log "Configuring nginx site for ${DOMAIN}"
  cat > "${NGINX_SITE}" <<EOF
# managed-by: verified-tours-install
server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN};

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
EOF
  ln -sfn "${NGINX_SITE}" /etc/nginx/sites-enabled/verified-tours
  # Disable default site if it steals :80
  rm -f /etc/nginx/sites-enabled/default
  nginx -t || die "nginx -t failed"
  systemctl reload nginx
}

obtain_certificate() {
  [[ -n "${DOMAIN}" ]] || die "DOMAIN is required for certbot."
  if [[ -z "${LE_EMAIL}" ]]; then
    load_env_defaults
  fi
  [[ -n "${LE_EMAIL}" ]] || die "LE_EMAIL is required for certbot."
  log "Obtaining Let's Encrypt certificate for ${DOMAIN}"
  certbot --nginx -d "${DOMAIN}" --email "${LE_EMAIL}" --agree-tos --non-interactive --redirect
}

resolve_domain_for_update() {
  if [[ -f "${INSTALL_DOMAIN_FILE}" ]]; then
    DOMAIN="$(tr -d '[:space:]' < "${INSTALL_DOMAIN_FILE}")"
  fi
  if [[ -z "${DOMAIN}" ]]; then
    load_env_defaults
  fi
  [[ -n "${DOMAIN}" ]] || die "DOMAIN unknown; re-run with reconfigure or set NEXTAUTH_URL in .env."
}

stop_docker_stack_if_present() {
  # Migrating from earlier Docker-based installs
  if [[ -f "${INSTALL_ROOT}/docker-compose.yml" ]] && command -v docker >/dev/null 2>&1; then
    if docker compose -f "${INSTALL_ROOT}/docker-compose.yml" ps -q 2>/dev/null | grep -q .; then
      log "Stopping previous Docker Compose stack (host install replaces it)…"
      docker compose -f "${INSTALL_ROOT}/docker-compose.yml" down || true
    fi
  fi
}

finish_marker() {
  touch "${MARKER}"
  log "Done. Portal: https://${DOMAIN}"
  log "Logs: journalctl -u verified-tours-web -f"
  log "Re-run this script anytime to update."
}

# Keep AGENT_WORKSPACE current on updates without full reconfigure.
patch_env_slim_paths() {
  local env_file="${INSTALL_ROOT}/.env"
  [[ -f "${env_file}" ]] || return 0
  if grep -q '^AGENT_WORKSPACE=' "${env_file}"; then
    sed -i "s|^AGENT_WORKSPACE=.*|AGENT_WORKSPACE=${WORKSPACE_DIR}|" "${env_file}"
  else
    printf '\nAGENT_WORKSPACE=%s\n' "${WORKSPACE_DIR}" >> "${env_file}"
  fi
  if grep -q '^AGENT_MUTEX_PATH=' "${env_file}"; then
    sed -i 's|^AGENT_MUTEX_PATH=.*|AGENT_MUTEX_PATH=/var/lock/cursor-agent.lock|' "${env_file}"
  else
    printf '\nAGENT_MUTEX_PATH=/var/lock/cursor-agent.lock\n' >> "${env_file}"
  fi
  if ! grep -q '^DISK_ALERT_USED_PCT=' "${env_file}"; then
    printf '\nDISK_ALERT_USED_PCT=85\n' >> "${env_file}"
  fi
  if ! grep -q '^DISK_ALERT_COOLDOWN_HOURS=' "${env_file}"; then
    printf 'DISK_ALERT_COOLDOWN_HOURS=6\n' >> "${env_file}"
  fi
}

stop_host_services() {
  if systemctl list-unit-files verified-tours-web.service >/dev/null 2>&1; then
    log "Stopping verified-tours services before replacing runtime…"
    systemctl stop verified-tours-worker verified-tours-web 2>/dev/null || true
  fi
}

main() {
  require_root
  require_ubuntu
  install_packages

  local mode=install
  if is_installed; then
    mode=update
    log "Existing host install detected at ${INSTALL_ROOT}"
    prompt RECONFIGURE_ANS "Reconfigure domain/secrets/OAuth/Cursor key? [y/N]" "N"
    case "${RECONFIGURE_ANS}" in
      y|Y|yes|YES) RECONFIGURE=1 ;;
      *) RECONFIGURE=0 ;;
    esac
  else
    RECONFIGURE=1
  fi

  require_disk_for_build
  ensure_build_tree
  stop_docker_stack_if_present
  stop_host_services

  mkdir -p "${INSTALL_ROOT}" "${WORKSPACE_DIR}"
  ensure_data_dirs

  if [[ "${RECONFIGURE}" -eq 1 ]]; then
    load_env_defaults
    prompt_config
    write_env
  else
    load_env_defaults
    resolve_domain_for_update
    patch_env_slim_paths
  fi

  install_cursor_cli
  # Re-check after clone/prompts — peak is npm ci + next build
  require_disk_for_build
  install_app
  write_mcp_json
  write_systemd_units
  start_services

  local prev_domain=""
  if [[ -f "${INSTALL_DOMAIN_FILE}" ]]; then
    prev_domain="$(tr -d '[:space:]' < "${INSTALL_DOMAIN_FILE}" || true)"
  fi

  local site_missing=0
  [[ -f "${NGINX_SITE}" ]] || site_missing=1
  local domain_changed=0
  if [[ -z "${prev_domain}" ]] || [[ "${prev_domain}" != "${DOMAIN}" ]]; then
    domain_changed=1
  fi

  if [[ "${site_missing}" -eq 1 ]] || [[ "${domain_changed}" -eq 1 ]]; then
    configure_nginx
  fi
  if [[ "${site_missing}" -eq 1 ]] || [[ "${domain_changed}" -eq 1 ]]; then
    obtain_certificate
    printf '%s\n' "${DOMAIN}" > "${INSTALL_DOMAIN_FILE}"
  fi

  finish_marker
  log "Install finished (mode=${mode}, slim runtime under ${INSTALL_ROOT})."
  log "Build tree at ${BUILD_ROOT} is pruned after each install (re-fetched on updates)."
  log_disk
}

main "$@"
