// Simple scoped logger with levels and ISO timestamps
// Usage: const log = createLogger('publisher'); log.info('message', { extra: 1 })

import { appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const DEFAULT_LEVEL = process.env.TAGKY_LOG_LEVEL?.toLowerCase?.() || 'info';
const CURRENT_LEVEL = LEVELS[DEFAULT_LEVEL] ?? LEVELS.info;
const ENABLE_FILE_LOGGING = process.env.TAGKY_FILE_LOGGING !== '0'; // enabled by default

// Get the project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const LOGS_DIR = join(PROJECT_ROOT, 'logs');

// Ensure logs directory exists
try {
  mkdirSync(LOGS_DIR, { recursive: true });
} catch (e) {
  // Directory might already exist, ignore
}

function ts() {
  return new Date().toISOString();
}

function fmt(scope, level, msg, meta) {
  const base = `[${ts()}][${scope}][${level.toUpperCase()}] ${msg}`;
  if (!meta) return base;
  try {
    const extra = typeof meta === 'string' ? meta : JSON.stringify(meta);
    return `${base} ${extra}`;
  } catch {
    return base;
  }
}

function writeToFile(scope, logLine) {
  if (!ENABLE_FILE_LOGGING) return;
  
  try {
    const logFile = join(LOGS_DIR, `${scope}.log`);
    appendFileSync(logFile, logLine + '\n', 'utf8');
  } catch (e) {
    // Fallback to console if file writing fails
    console.error(`[LOGGER] Failed to write to log file for ${scope}:`, e.message);
  }
}

export function createLogger(scope) {
  const should = (level) => LEVELS[level] >= CURRENT_LEVEL;
  
  const logWithFile = (level, msg, meta) => {
    if (!should(level)) return;
    
    const logLine = fmt(scope, level, msg, meta);
    
    // Always log to console
    if (level === 'error') {
      console.error(logLine);
    } else if (level === 'warn') {
      console.warn(logLine);
    } else {
      console.log(logLine);
    }
    
    // Also log to file
    writeToFile(scope, logLine);
  };
  
  return {
    debug(msg, meta) { logWithFile('debug', msg, meta); },
    info(msg, meta) { logWithFile('info', msg, meta); },
    warn(msg, meta) { logWithFile('warn', msg, meta); },
    error(msg, meta) { logWithFile('error', msg, meta); },
    level: DEFAULT_LEVEL,
    scope
  };
}
