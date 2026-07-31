# verified-tours

Personal portal for **on-demand** package-tour search with Cursor CLI agent + **human final verification**. Built as a sibling to [newsdigest](../newsdigest): same host Node/systemd shape, no Docker, shared personal `CURSOR_API_KEY`, host-wide agent mutex.

## Architecture

1. Admin submits a brief → `SearchRequest` + `AgentJob`.
2. Agent calls MCP: `lookup_verified_offers` → search OTAs → open package pages → `submit_offer_candidate` / `mark_offer_rejected_auto` → `finish_search_job`.
3. Admin confirms/rejects in **Admin → Offers**.
4. Verified rows (TTL) are reused on the next search; rejected fingerprints are avoided.

## Apps

| App | Role |
|-----|------|
| `apps/web` | Next.js 16 portal (port **3001** by default) |
| `apps/worker` | Hourly disk check + admin webhook alert |
| `apps/mcp-server` | stdio MCP tools → internal API |

## Local setup

```bash
cp .env.example .env
# fill NEXTAUTH_*, OAuth, ALLOWED_EMAILS, INTERNAL_API_KEY, CURSOR_API_KEY
npm install
npm run db:push --workspace=web
npm run db:seed --workspace=web
npm run dev:web
```

Worker (optional locally):

```bash
PORTAL_URL=http://127.0.0.1:3001 INTERNAL_API_KEY=... npm run dev:worker
```

MCP (Cursor `mcp.json` example):

```json
{
  "mcpServers": {
    "verified-tours": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/verified-tours/apps/mcp-server/src/index.ts"],
      "env": {
        "PORTAL_URL": "http://127.0.0.1:3001",
        "INTERNAL_API_KEY": "change-me"
      }
    }
  }
}
```

## Same weak VPS as newsdigest

**Disk:** a 10 GB VPS with newsdigest already at ~80% full is **too tight** for a naive second build (`npm ci` + `next build` peaks ~2.2 GiB free). `install.sh` now:

1. Checks free space (wants ≥ 2200 MiB, hard floor 1650 MiB) and reclaims build caches / logs
2. Reclaims apt/journal/npm cache and prunes `/var/tmp/newsdigest-build` if needed (runtime `/opt/newsdigest` untouched)
3. After staging, prunes `/var/tmp/verified-tours-build` heavy artifacts

Before install, on the VPS:

```bash
df -h /
du -xh /var/tmp /opt --max-depth=2 2>/dev/null | sort -h | tail -20
# optional manual free-up:
rm -rf /var/tmp/newsdigest-build/node_modules /var/tmp/newsdigest-build/apps/web/.next
apt-get clean && journalctl --vacuum-size=40M
```

```bash
curl -fsSL https://raw.githubusercontent.com/rborisov/verified-tours/main/install.sh | bash
```

- **No Docker** — host Node + systemd (`install.sh`).
- Install root: `/opt/verified-tours`, build cache `/var/tmp/verified-tours-build`.
- Ports: newsdigest `:3000`, verified-tours `:3001`.
- One nginx, two `server_name`s / certs.
- `AGENT_MUTEX_PATH=/var/lock/cursor-agent.lock` shared so only one Cursor agent runs.
- Same personal `CURSOR_API_KEY` in both `.env` files.
- MCP merge: installer keeps `news-digest` entries in `~/.cursor/mcp.json`.

## Disk alerts

Worker cron (default hourly) checks used %. Above `DISK_ALERT_USED_PCT` posts to `DISK_ALERT_WEBHOOK_URL` and stores `DiskAlert` (cooldown `DISK_ALERT_COOLDOWN_HOURS`).

## Local smoke checklist

1. Fill `.env` (OAuth + `CURSOR_API_KEY` + `INTERNAL_API_KEY`).
2. `npm run db:push --workspace=web && npm run db:seed --workspace=web`
3. `npm run dev:web` → sign in → run search form.
4. Point Cursor MCP at `mcp.json.example` (or built `apps/mcp-server`).
5. Admin → Offers → Confirm/Reject; home shows verified rows.
