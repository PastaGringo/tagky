#!/usr/bin/env node
import './lib/load-env.js';
import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import Database from 'better-sqlite3';
import { createLogger } from './lib/logger.js';

// Config via env or defaults
const FETCH_INTERVAL_MS = Number(process.env.TAGKY_FETCH_INTERVAL_MS || 60000); // 60s
const WORKER_INTERVAL_MS = Number(process.env.TAGKY_WORKER_INTERVAL_MS || 5000); // 5s
const PUBLISHER_INTERVAL_MS = Number(process.env.TAGKY_PUBLISH_INTERVAL_MS || 30000); // 30s
const QUIET_PUBLISH = process.env.TAGKY_QUIET_TAGS === '1'; // respect env, default false

const log = createLogger('start');
const PID_FILE = '.tagky.pid';

function readStartupReport() {
  try {
    const dbPath = new URL('./queue.db', import.meta.url).pathname;
    const db = new Database(dbPath, { readonly: true });
    const row = {};
    row.followed_users = db.prepare('SELECT COUNT(*) AS c FROM followed_users').get()?.c ?? 0;
    row.tags_rows = db.prepare('SELECT COUNT(*) AS c FROM tags').get()?.c ?? 0;
    row.tags_posts = db.prepare('SELECT COUNT(DISTINCT post_uri) AS c FROM tags').get()?.c ?? 0;
    row.jobs_pending = db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE status = 'pending'").get()?.c ?? 0;
    row.jobs_processing = db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE status = 'processing'").get()?.c ?? 0;
    row.jobs_done = db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE status = 'done'").get()?.c ?? 0;
    row.jobs_error = db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE status = 'error'").get()?.c ?? 0;
    row.processed_notifications = db.prepare('SELECT COUNT(*) AS c FROM processed_notifications').get()?.c ?? 0;
    db.close();
    return row;
  } catch (e) {
    log.warn('startup report failed', { error: e?.message });
    return null;
  }
}

// Pretty console box (no deps)
function color(c, s){
  const map = { reset: '\u001b[0m', dim: '\u001b[2m', cyan: '\u001b[36m', green: '\u001b[32m', gray: '\u001b[90m' };
  return (map[c] || '') + s + map.reset;
}
function box(title, lines){
  const maxWidth = Math.min(100, Math.max(title.length + 2, ...lines.map(l => l.length)) + 2);
  const top = `┌${'─'.repeat(maxWidth)}┐`;
  const bot = `└${'─'.repeat(maxWidth)}┘`;
  const t = `│ ${title.padEnd(maxWidth - 1, ' ')}│`;
  const sep = `├${'─'.repeat(maxWidth)}┤`;
  const body = lines.map(l => `│ ${l.padEnd(maxWidth - 1, ' ')}│`).join('\n');
  return [color('cyan', top), color('cyan', t), color('cyan', sep), body, color('cyan', bot)].join('\n');
}
function fmtKV(label, value){
  const v = typeof value === 'undefined' || value === null ? '' : String(value);
  return `${label.padEnd(18, ' ')}${color('gray','|')} ${v}`;
}

function runOne(command, args, opts = {}) {
  return new Promise((resolve) => {
    log.debug(`spawn ${command} ${args.join(' ')}`);
    const child = spawn(command, args, { stdio: 'inherit', ...opts });
    child.on('exit', (code) => {
      log.info(`process exited`, { cmd: command, args, code: code ?? 0 });
      resolve(code ?? 0);
    });
    child.on('error', () => resolve(1));
  });
}

let fetcherRunning = false;
let workerRunning = false;

async function tickFetcher() {
  if (fetcherRunning) return; // prevent overlap
  fetcherRunning = true;
  try {
    const code = await runOne('node', ['fetcher.js']);
    if (code !== 0) log.warn('fetcher returned non-zero exit code', { code });
  } finally {
    fetcherRunning = false;
  }
}

async function tickWorker() {
  if (workerRunning) return; // prevent overlap
  workerRunning = true;
  try {
    const code = await runOne('node', ['worker.js']);
    if (code !== 0) log.warn('worker returned non-zero exit code', { code });
  } finally {
    workerRunning = false;
  }
}

function startPublisherLoop() {
  const args = ['publisher.js', '--loop', '--interval', String(PUBLISHER_INTERVAL_MS)];
  if (QUIET_PUBLISH) args.push('--quiet');
  const child = spawn('node', args, { stdio: 'inherit' });
  log.info('publisher loop started', { args, pid: child.pid, quiet: QUIET_PUBLISH, interval_ms: PUBLISHER_INTERVAL_MS });
  child.on('exit', (code) => {
    log.warn('publisher loop exited', { code });
  });
  return child;
}

(async function main(){
  // Config snapshot (no secrets)
  const mask = (s) => (s && s.length > 14) ? `${s.slice(0,8)}…${s.slice(-6)}` : (s || undefined);
  const host = (u) => {
    try { return (u ? new URL(u).host : undefined); } catch { return u; }
  };
  const envData = {
    public_key: mask(process.env.PUBLIC_KEY),
    nexus_api_url: process.env.NEXUS_API_URL,
    nexus_host: host(process.env.NEXUS_API_URL),
    ollama_url: process.env.OLLAMA_URL,
    ollama_host: host(process.env.OLLAMA_URL),
    ollama_model: process.env.OLLAMA_MODEL,
    fetcher_ms: Number(process.env.TAGKY_FETCH_INTERVAL_MS || '60000'),
    worker_ms: Number(process.env.TAGKY_WORKER_INTERVAL_MS || '5000'),
    publisher_ms: Number(process.env.TAGKY_PUBLISH_INTERVAL_MS || '30000'),
    log_level: process.env.TAGKY_LOG_LEVEL || 'info',
    quiet_publish: process.env.TAGKY_QUIET_TAGS === '1',
  };
  const report = readStartupReport();
  const lines = [
    color('dim','ENV'),
    fmtKV('public_key', envData.public_key || ''),
    fmtKV('nexus_host', envData.nexus_host || ''),
    fmtKV('ollama_host', envData.ollama_host || ''),
    fmtKV('ollama_model', envData.ollama_model || ''),
    fmtKV('fetcher_ms', envData.fetcher_ms),
    fmtKV('worker_ms', envData.worker_ms),
    fmtKV('publisher_ms', envData.publisher_ms),
    fmtKV('log_level', envData.log_level),
    fmtKV('quiet_publish', envData.quiet_publish),
    '',
    color('dim','REPORT'),
    ...(report ? [
      fmtKV('followed_users', report.followed_users),
      fmtKV('tags_rows', report.tags_rows),
      fmtKV('tags_posts', report.tags_posts),
      fmtKV('jobs_pending', report.jobs_pending),
      fmtKV('jobs_processing', report.jobs_processing),
      fmtKV('jobs_done', report.jobs_done),
      fmtKV('jobs_error', report.jobs_error),
      fmtKV('processed_notif', report.processed_notifications),
    ] : [fmtKV('report', 'unavailable')]),
  ];
  log.info('\n' + box('TagKy startup', lines));
  log.info('🚀 tagky-v1 starter');
  log.info('schedule', {
    fetcher_ms: FETCH_INTERVAL_MS,
    worker_ms: WORKER_INTERVAL_MS,
    publisher_ms: PUBLISHER_INTERVAL_MS,
    quiet_publish: QUIET_PUBLISH
  });

  // immediate kicks
  tickFetcher();
  tickWorker();
  const pub = startPublisherLoop();

  // write PID file for external stop control
  try {
    writeFileSync(PID_FILE, String(process.pid), { encoding: 'utf8' });
  } catch (e) {
    log.warn('failed to write PID file', { error: e?.message || String(e) });
  }

  // intervals
  const fetcherTimer = setInterval(tickFetcher, FETCH_INTERVAL_MS);
  const workerTimer = setInterval(tickWorker, WORKER_INTERVAL_MS);

  function shutdown() {
    log.info('👋 stopping...');
    clearInterval(fetcherTimer);
    clearInterval(workerTimer);
    try { pub.kill('SIGTERM'); } catch(_) {}
    // allow child processes to exit naturally
    setTimeout(() => process.exit(0), 500);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // cleanup pidfile on exit
  process.on('exit', () => {
    try { unlinkSync(PID_FILE); } catch(_) {}
  });
})();
