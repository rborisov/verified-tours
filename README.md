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

- **No Docker** — host Node + systemd (mirror newsdigest installer later).
- Ports: newsdigest `:3000`, verified-tours `:3001`.
- One nginx, two server_names / certs.
- `AGENT_MUTEX_PATH=/var/lock/cursor-agent.lock` shared so only one Cursor agent runs.
- Same `CURSOR_API_KEY` in both `.env` files.

## Disk alerts

Worker cron (default hourly) checks used %. Above `DISK_ALERT_USED_PCT` posts to `DISK_ALERT_WEBHOOK_URL` and stores `DiskAlert` (cooldown `DISK_ALERT_COOLDOWN_HOURS`).
