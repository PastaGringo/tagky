# TagKy (build)

Minimal runnable package for TagKy.

## Overview
- Node.js ES modules.
- Centralized env loader: `lib/load-env.js`.
- Local-only env: `./.env.local` (ignored).

## Setup
1) Install deps
```bash
pnpm i   # or: npm i / yarn install
```

2) Configure env
```bash
cp ../.env.example ./.env.local
# edit ./.env.local with your keys (PUBLIC_KEY, SEED_PHRASE, ...)
```

## Run
- Orchestrator (spawns fetcher/worker/publisher):
```bash
node start.js
```
- Web monitor (dashboard):
```bash
node web-monitor.js
```

## Scripts
- `fetcher.js`: pulls notifications and enqueues jobs.
- `worker.js`: generates keywords (LLM) and updates jobs.
- `publisher.js`: publishes tags via Pubky API.
- `init-queue-db.js`: initializes SQLite schema (auto-run by start.js when needed).

## Environment
Key variables (set in `./.env.local`):
- `PUBLIC_KEY` (required)
- `SEED_PHRASE` or `MNEMONIC` (required)
- `NEXUS_API_URL`, `OLLAMA_URL`, `OLLAMA_MODEL`
- `TAGKY_*` intervals, flags, and messages
- `WEB_MONITOR_PORT`

Note: Docker usage belongs to the monorepo root; this sub-repo is for the runnable build only.
