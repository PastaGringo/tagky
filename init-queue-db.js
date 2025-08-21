#!/usr/bin/env node
import './lib/load-env.js';
import Database from 'better-sqlite3';

const dbPath = new URL('./queue.db', import.meta.url).pathname;
const db = new Database(dbPath);

function migrate() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_uri TEXT NOT NULL UNIQUE,
      content TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT,
      keywords TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);

    CREATE TABLE IF NOT EXISTS tags (
      post_uri TEXT NOT NULL,
      keyword TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(post_uri, keyword)
    );
    CREATE INDEX IF NOT EXISTS idx_tags_keyword ON tags(keyword);

    CREATE TABLE IF NOT EXISTS followed_users (
      user_id TEXT PRIMARY KEY,
      followed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS processed_notifications (
      post_uri TEXT PRIMARY KEY,
      processed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

migrate();
console.log('✅ SQLite initialized at', dbPath);

db.close();
