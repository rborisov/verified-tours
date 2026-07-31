import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function resolveAgentCli(): string {
  return process.env.CURSOR_CLI_PATH?.trim() || "agent";
}

export function resolveAgentWorkspace(): string {
  return (
    process.env.AGENT_WORKSPACE?.trim() ||
    path.resolve(process.cwd(), "../../workspace")
  );
}

export function resolveMutexPath(): string {
  return process.env.AGENT_MUTEX_PATH?.trim() || "/tmp/cursor-agent.lock";
}

export type MutexResult =
  | { ok: true; release: () => void }
  | { ok: false; error: string };

/** Non-blocking exclusive lock for host-wide single agent. */
export function tryAcquireAgentMutex(holder: string): MutexResult {
  const mutexPath = resolveMutexPath();
  try {
    fs.mkdirSync(path.dirname(mutexPath), { recursive: true });
  } catch {
    // ignore
  }

  try {
    const fd = fs.openSync(mutexPath, "wx");
    fs.writeFileSync(
      fd,
      JSON.stringify({ holder, pid: process.pid, at: new Date().toISOString() }),
    );
    fs.closeSync(fd);
    return {
      ok: true,
      release: () => {
        try {
          fs.unlinkSync(mutexPath);
        } catch {
          // ignore
        }
      },
    };
  } catch {
    let holderInfo = "unknown";
    try {
      holderInfo = fs.readFileSync(mutexPath, "utf8").trim();
    } catch {
      // ignore
    }
    return {
      ok: false,
      error: `Agent mutex busy (${mutexPath}): ${holderInfo}`,
    };
  }
}

export function offerFingerprint(input: {
  source: string;
  hotelId?: string | null;
  hotelName: string;
  fromCity: string;
  startDate: string;
  nights: number;
  adults: number;
  childrenAges: string;
}): string {
  const raw = [
    input.source.trim().toLowerCase(),
    (input.hotelId || input.hotelName).trim().toLowerCase(),
    input.fromCity.trim().toLowerCase(),
    input.startDate.slice(0, 10),
    String(input.nights),
    String(input.adults),
    input.childrenAges.replace(/\s+/g, ""),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export function spawnTourAgent(
  prompt: string,
  jobId: string,
): { ok: true; pid: number } | { ok: false; error: string } {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "CURSOR_API_KEY is not configured." };
  }

  const workspace = resolveAgentWorkspace();
  const cli = resolveAgentCli();
  const logsDir = path.join(workspace, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, `${jobId}.log`);

  const portalUrl = (process.env.PORTAL_URL || "http://127.0.0.1:3001").replace(
    /\/$/,
    "",
  );
  const internalKey = process.env.INTERNAL_API_KEY?.trim() || "";

  const wrapper = `
set -euo pipefail
WORKSPACE=${JSON.stringify(workspace)}
LOG=${JSON.stringify(logFile)}
CLI=${JSON.stringify(cli)}
JOB_ID=${JSON.stringify(jobId)}
PORTAL=${JSON.stringify(portalUrl)}
KEY=${JSON.stringify(internalKey)}
PROMPT_FILE=$(mktemp)
cat > "$PROMPT_FILE" <<'PROMPT_EOF'
${prompt}
PROMPT_EOF

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] starting tour agent job=$JOB_ID" >> "$LOG"
set +e
"$CLI" -p --force --sandbox disabled --trust --approve-mcps --output-format stream-json --workspace "$WORKSPACE" < "$PROMPT_FILE" >> "$LOG" 2>&1
CODE=$?
set -e
rm -f "$PROMPT_FILE"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] exited code=$CODE" >> "$LOG"
if [ -n "$KEY" ]; then
  curl -sS -X POST "$PORTAL/api/internal/agent-exited" \\
    -H "Content-Type: application/json" \\
    -H "x-internal-key: $KEY" \\
    -d "{\\"jobId\\":\\"$JOB_ID\\",\\"exitCode\\":$CODE}" >/dev/null || true
fi
exit $CODE
`;

  try {
    const child = spawn("/bin/bash", ["-c", wrapper], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        CURSOR_API_KEY: apiKey,
      },
    });
    child.unref();
    if (!child.pid) {
      return { ok: false, error: "Failed to spawn Cursor CLI agent wrapper." };
    }
    return { ok: true, pid: child.pid };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to spawn Cursor CLI agent.";
    return { ok: false, error: message };
  }
}

export function buildTourSearchPrompt(input: {
  jobId: string;
  requestId: string;
  adults: number;
  childrenAges: string;
  fromCity: string;
  countries: string;
  departFrom: string;
  departTo: string;
  nightsMin: number;
  nightsMax: number;
  seaRequired: boolean;
  visaFreeOnly: boolean;
  preferHot: boolean;
  rawBrief?: string | null;
}): string {
  return `MODE: verified_tours
jobId: ${input.jobId}
requestId: ${input.requestId}

adults: ${input.adults}
children ages: ${input.childrenAges || "(none)"}
from: ${input.fromCity}
prefer countries: ${input.countries}
depart: ${input.departFrom} through ${input.departTo}
nights: ${input.nightsMin}..${input.nightsMax}
sea: ${input.seaRequired ? "yes" : "no"}
visa free only: ${input.visaFreeOnly ? "yes" : "no"}
prefer last-minute/discount badge: ${input.preferHot ? "yes" : "no"}
${input.rawBrief ? `raw brief:\\n${input.rawBrief}\\n` : ""}

MUST:
1) Call MCP lookup_verified_offers first (reuse verified; avoid rejected fingerprints).
2) Search multiple RU package OTAs (not only Level.Travel).
3) Open hotel package page; confirm departure city + dates + party + flight price.
4) If city wrong OR price drift >15% → mark_offer_rejected_auto (do not publish).
5) Otherwise submit_offer_candidate (pending_human). Max 5 candidates.
6) Call finish_search_job when done.

Human will do final verification in admin UI.`;
}
