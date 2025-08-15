# TagKy Bot

TagKy is an intelligent tagging assistant for the Pubky network that automatically analyzes user posts and applies relevant tags to improve content discoverability.

## What is TagKy?

TagKy is a bot that helps users on the Pubky network by automatically generating and applying relevant tags to their posts. It uses AI analysis to understand content and suggest 1-3 meaningful keywords that enhance post discoverability.

## How it Works

### User Interaction
1. **Opt-In**: Users enable the service by mentioning the bot with `/tag on`
2. **Profile Tagging**: The bot adds a `tagky-👀` tag to the user's profile to indicate they're being followed
3. **Opt-Out**: Users can disable the service anytime with `/tag off`

### Processing Pipeline
1. **Discovery** (`fetcher.js`): Monitors mentions for commands and discovers new posts from opted-in users
2. **Queuing**: New posts are added to an SQLite queue for processing
3. **Analysis** (`worker.js`): AI analyzes post content using Ollama to generate relevant keywords
4. **Publishing** (`publisher.js`): Generated tags are published to the Pubky network

## Core Components

- **`fetcher.js`**: Handles user commands (`/tag on`, `/tag off`) and discovers new content from followed users
- **`worker.js`**: Processes queued posts, calls Ollama for AI analysis, and manages temporary tags
- **`publisher.js`**: Publishes final tags to the Pubky network
- **`web-monitor.js`**: Provides a web interface to monitor the queue status
- **`queue.db`**: SQLite database managing the job queue and processing states
- **`init-queue-db.js`**: Initializes the SQLite database schema

## Prerequisites

- **Node.js** (v18 or higher)
- **pnpm** package manager (required)
- **Ollama** running locally or accessible remotely
- **Pubky credentials** (public key and seed phrase)

## Installation & Setup

### 1. Configuration

Copy the environment template and configure your settings:

```bash
cp .env.example .env
```

Edit the `.env` file and fill in the required values:

```bash
# Required secrets
PUBLIC_KEY="your_pubky_public_key"
SEED_PHRASE="your_seed_phrase"

# Endpoints (adjust if needed)
NEXUS_API_URL="https://nexus.pubky.app"
OLLAMA_URL="http://localhost:11434"
OLLAMA_MODEL="mistral:7b"

# Other settings can remain as default
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Initialize Database

```bash
pnpm exec node init-queue-db.js
```

## Running the Application

### Option 1: With Docker (Recommended)

Refer to the `docker-compose.yml` and `README.md` in the parent `tagky-docker` directory.

### Option 2: Manual Execution (Development)

For development or debugging, you can run each component separately in different terminals:

#### Terminal 1 - Fetcher
```bash
pnpm exec node fetcher.js
```
*Discovers new posts and handles user commands*

#### Terminal 2 - Worker
```bash
pnpm exec node worker.js
```
*Processes posts with AI analysis*

#### Terminal 3 - Publisher
```bash
pnpm exec node publisher.js
```
*Publishes generated tags to the network*

#### Terminal 4 - Web Monitor (Optional)
```bash
pnpm exec node web-monitor.js
```
*Provides web interface at `http://localhost:3001`*

### Option 3: All-in-One Script

You can also use the start script from the parent directory:

```bash
node ../../../start.js
```

## Monitoring

- **Web Interface**: Access `http://localhost:3001` (or your configured port) to view queue status
- **Logs**: Each component outputs detailed logs to help with debugging
- **Database**: You can inspect `queue.db` directly with any SQLite browser

## Configuration Options

Key environment variables you can adjust:

- `TAGKY_FETCH_INTERVAL_MS`: How often to check for new content (default: 5000ms)
- `TAGKY_WORKER_INTERVAL_MS`: How often to process queued jobs (default: 5000ms)
- `TAGKY_PUBLISH_INTERVAL_MS`: How often to publish tags (default: 5000ms)
- `TAGKY_LOG_LEVEL`: Logging verbosity (`debug`, `info`, `warn`, `error`)
- `TAGKY_WEB_MONITOR_PORT`: Port for the web monitor interface (default: 3001)

## Troubleshooting

- **Ollama Connection**: Ensure Ollama is running and accessible at the configured URL
- **Pubky Credentials**: Verify your public key and seed phrase are correct
- **Database Issues**: Delete `queue.db` and run `init-queue-db.js` again
- **Network Issues**: Check that Nexus API is accessible

## Development

For development, running components separately allows you to:
- See individual component logs
- Restart specific services without affecting others
- Debug issues more easily
- Test individual components in isolation