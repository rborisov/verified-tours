# Verified tours — design (scaffold)

Date: 2026-07-31  
Status: approved in conversation; scaffold implemented

## Goal

Separate git repo from newsdigest. On-demand Cursor agent searches package tours; human confirms before “verified”; SQLite cache reused by agent.

## Non-goals (v1)

- Telegra.ph / topic digests
- Scheduled tour searches
- Docker on the small VPS
- Second Cursor subscription / API key

## Data

- `SearchRequest` — brief + status
- `Offer` — candidate / pending_human / verified / rejected / expired + fingerprint
- `AgentJob` — spawn lifecycle
- `DiskAlert` — notify admin on disk pressure
- Auth allowlist + Auth.js models (copied pattern)

## MCP

`lookup_verified_offers`, `submit_offer_candidate`, `mark_offer_rejected_auto`, `finish_search_job`

## Host sharing

File mutex `AGENT_MUTEX_PATH`; port 3001; shared personal `CURSOR_API_KEY`.
