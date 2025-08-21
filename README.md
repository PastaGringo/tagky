# TagKy (build)

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
[![GitHub stars](https://img.shields.io/github/stars/PastaGringo/tagky?style=social)](https://github.com/PastaGringo/tagky)
[![GitHub issues](https://img.shields.io/github/issues/PastaGringo/tagky)](https://github.com/PastaGringo/tagky/issues)
[![Last commit](https://img.shields.io/github/last-commit/PastaGringo/tagky)](https://github.com/PastaGringo/tagky/commits/main)

Minimal runnable package for TagKy.

## Quick start

```bash
# 1) Install deps
pnpm i   # or: npm i / yarn install

# 2) Create local env
cp ./.env.example ./.env.local
# then edit ./.env.local (PUBLIC_KEY, SEED_PHRASE, ...)

# 3) Run orchestrator
node start.js

# 4) Optional: Web monitor (in another terminal)
node web-monitor.js
```

Web monitor: http://localhost:${WEB_MONITOR_PORT:-3001}

## What is TagKy?

- __Purpose__: TagKy is a bot that automatically tags posts with 1–3 relevant keywords.
- __Platform__: Publishes tags via the Pubky protocol and `@synonymdev/pubky` client.
- __LLM__: Uses a local/remote Ollama model (configurable) to extract concise keywords.
- __Dashboard__: Includes a real‑time web monitor to visualize stats and activity.

### High-level flow

1. __Fetcher__ (`fetcher.js`): listens to notifications/mentions and enqueues jobs in SQLite.
2. __Worker__ (`worker.js`): calls Ollama to generate 1–3 keywords and updates job state.
3. __Publisher__ (`publisher.js`): publishes tags to Pubky for the target post/user.
4. __Web Monitor__ (`web-monitor.js`): live dashboard for stats, errors and recent activity.
5. __Orchestrator__ (`start.js`): starts and supervises the fetcher/worker/publisher.

## Overview

- Node.js ES modules.
- Centralized env loader: `lib/load-env.js`.
- Local-only env: `./.env.local` (ignored).

## Setup

1. Install deps
```bash
pnpm i   # or: npm i / yarn install
```
2. Configure env
```bash
cp ./.env.example ./.env.local
# edit ./.env.local with your keys (PUBLIC_KEY, SEED_PHRASE, ...)
```

## Run

- Orchestrator (spawns fetcher/worker/publisher)
```bash
node start.js
```
- Web monitor (dashboard)
```bash
node web-monitor.js
```

## Scripts

- `fetcher.js`: pulls notifications and enqueues jobs.
- `worker.js`: generates keywords (LLM) and updates jobs.
- `publisher.js`: publishes tags via Pubky API.
- `init-queue-db.js`: initializes SQLite schema (auto-run by start.js when needed).

## Architecture details

- __Database__: local SQLite (`queue.db`) for jobs, tags and metrics.
- __Env management__: `lib/load-env.js` loads `./.env.local` (preferred) without overriding existing `process.env`.
- __Tagging rules__: prompt enforces 1–3 keywords, semicolon-separated, spaces replaced by hyphens.
- __Resilience__: worker/publisher log errors and keep job state for retries/analysis.

## Environment

Key variables (set in `./.env.local`):
- `PUBLIC_KEY` (required)
- `SEED_PHRASE` or `MNEMONIC` (required)
- `NEXUS_API_URL`, `OLLAMA_URL`, `OLLAMA_MODEL`
- `TAGKY_*` intervals, flags, and messages
- `WEB_MONITOR_PORT`

Note: Docker usage belongs to the monorepo root; this sub-repo is for the runnable build only.
