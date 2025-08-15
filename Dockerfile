# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS base

# Install build deps in case native modules (e.g., better-sqlite3) need to compile
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python-is-python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Enable pnpm via Corepack
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
ENV PNPM_UNSAFE_PERM=true
ENV PNPM_ALLOW_SCRIPTS=true
ENV npm_config_build_from_source=true

WORKDIR /app

# Install dependencies first (better caching)
COPY package.json pnpm-lock.yaml* ./
# Install deps (better-sqlite3 will build via pnpm.onlyBuiltDependencies)
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Keep built native artifacts; avoid pruning which can remove compiled binaries under pnpm

# Default env
ENV NODE_ENV=production

# The app writes a SQLite file (queue.db) in the working directory.
# Consider mounting a volume to persist it across container restarts.
# Example: -v $(pwd)/data:/app

# Expose port for web monitor interface
EXPOSE 3001

# Ensure DB schema exists, then start the bot and web monitor
CMD ["sh", "-c", "node init-queue-db.js && node start.js & node web-monitor.js"]
