#!/usr/bin/env node
import './lib/load-env.js';
import Database from 'better-sqlite3';
import { createLogger } from './lib/logger.js';

// Publisher: reads processed jobs from SQLite and publishes tags via lib/pubky.js
// It calls: tagPostWithKeywords(postUri, keywords)

const db = new Database(new URL('./queue.db', import.meta.url).pathname);
const log = createLogger('publisher');

// args and env
const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const getArg = (name, def) => {
  const idx = argv.indexOf(name);
  if (idx !== -1 && idx + 1 < argv.length) return argv[idx + 1];
  return def;
};
const LOOP = has('--loop');
const QUIET_TAG = has('--quiet') || process.env.TAGKY_QUIET_TAGS === '1';
const INTERVAL_MS = Number(getArg('--interval', process.env.TAGKY_PUBLISH_INTERVAL_MS || 30000));
const BATCH = Number(getArg('--batch', process.env.TAGKY_PUBLISH_BATCH || 20));

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS published_posts (
      post_uri TEXT PRIMARY KEY,
      published_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_error TEXT
    );
  `);
}

function getUnpublishedDoneJobs(limit = 20) {
  return db.prepare(`
    SELECT j.id, j.post_uri, j.keywords, j.created_at, j.processed_at
    FROM jobs j
    LEFT JOIN published_posts p ON p.post_uri = j.post_uri
    WHERE j.status = 'done' AND j.keywords IS NOT NULL AND j.keywords <> ''
      AND (p.post_uri IS NULL OR p.last_error IS NOT NULL)
    ORDER BY j.processed_at NULLS LAST, j.created_at
    LIMIT ?
  `).all(limit);
}

function markPublished(postUri) {
  db.prepare(`INSERT INTO published_posts(post_uri, last_error) VALUES(?, NULL)
              ON CONFLICT(post_uri) DO UPDATE SET last_error = NULL, published_at = datetime('now')`).run(postUri);
}

function recordError(postUri, err) {
  db.prepare(`INSERT INTO published_posts(post_uri, last_error) VALUES(?, ?)
              ON CONFLICT(post_uri) DO UPDATE SET last_error=excluded.last_error, published_at=datetime('now')`)
    .run(postUri, String(err).slice(0, 2000));
}

async function publishWithV1Lib(postUri, keywords) {
  const mod = await import('./lib/pubky.js');
  const fn = mod.tagPostWithKeywords || (mod.default && mod.default.tagPostWithKeywords);
  if (!fn) throw new Error('lib/pubky.js does not export tagPostWithKeywords');
  // If quiet, suppress console during publish (for libraries that may log)
  if (QUIET_TAG) {
    const origLog = console.log; const origWarn = console.warn;
    try { console.log = () => {}; console.warn = () => {}; await fn(postUri, keywords); }
    finally { console.log = origLog; console.warn = origWarn; }
    return;
  }
  await fn(postUri, keywords);
}

async function runOnce(){
  const jobs = getUnpublishedDoneJobs(BATCH);
  if (jobs.length === 0) {
    if (!LOOP) log.info('📭 nothing to publish');
    return 0;
  }
  let ok = 0;
  log.info('publishing batch', { size: jobs.length });
  for (const j of jobs) {
    try {
      // compute latency metrics
      const parseUtc = (s) => {
        if (!s) return null;
        // SQLite datetime('now') yields 'YYYY-MM-DD HH:MM:SS' (UTC). Coerce to ISO UTC.
        return Date.parse(String(s).replace(' ', 'T') + 'Z');
      };
      const now = Date.now();
      const tCreated = parseUtc(j.created_at);
      const tProcessed = parseUtc(j.processed_at);
      const detectToDoneMs = (tCreated && tProcessed) ? (tProcessed - tCreated) : null;
      await publishWithV1Lib(j.post_uri, j.keywords);
      markPublished(j.post_uri);
      const doneToPublishMs = tProcessed ? (now - tProcessed) : null;
      const detectToPublishMs = tCreated ? (now - tCreated) : null;
      log.info('✅ published', {
        post_uri: j.post_uri,
        keywords: j.keywords,
        job_id: j.id,
        timings_ms: {
          detect_to_done: detectToDoneMs,
          done_to_publish: doneToPublishMs,
          detect_to_publish: detectToPublishMs,
        }
      });
      ok++;
    } catch (e) {
      recordError(j.post_uri, e?.message || String(e));
      log.error('❌ publish failed', { post_uri: j.post_uri, error: e?.message || String(e) });
    }
  }
  log.info('batch summary', { attempted: jobs.length, success: ok, failed: jobs.length - ok });
  return ok;
}

(async function main(){
  try {
    ensureSchema();
    if (LOOP) {
      log.info('🔁 loop started', { interval_ms: INTERVAL_MS, batch: BATCH, quiet: QUIET_TAG });
      let running = true;
      process.on('SIGINT', () => { running = false; });
      process.on('SIGTERM', () => { running = false; });
      while (running) {
        await runOnce();
        await sleep(INTERVAL_MS);
      }
      log.info('👋 loop stopped');
    } else {
      await runOnce();
    }
  } catch (e) {
    log.error('❌ fatal', { error: e?.message || String(e) });
    process.exitCode = 1;
  } finally {
    db.close();
  }
})();
