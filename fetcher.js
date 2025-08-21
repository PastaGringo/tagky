#!/usr/bin/env node
import './lib/load-env.js';
import Database from 'better-sqlite3';
import { createLogger } from './lib/logger.js';

const NEXUS = process.env.NEXUS_API_URL || 'https://nexus.pubky.app';
const PUBLIC_KEY = process.env.PUBLIC_KEY;
const TAGKY_FOLLOW_TAG = process.env.TAGKY_FOLLOW_TAG || 'tagky-👀';
if (!PUBLIC_KEY) {
  const log0 = createLogger('fetcher');
  log0.error('❌ PUBLIC_KEY is required in .env');
  process.exit(1);
}

const db = new Database(new URL('./queue.db', import.meta.url).pathname);
const log = createLogger('fetcher');

function addJob(postUri, content) {
  const stmt = db.prepare(`INSERT OR IGNORE INTO jobs(post_uri, content, status) VALUES(?, ?, 'pending')`);
  stmt.run(postUri, content || null);
}
function markNotificationProcessed(postUri) {
  const stmt = db.prepare(`INSERT OR IGNORE INTO processed_notifications(post_uri) VALUES(?)`);
  stmt.run(postUri);
}
function isNotificationProcessed(postUri) {
  const row = db.prepare(`SELECT 1 FROM processed_notifications WHERE post_uri = ?`).get(postUri);
  return !!row;
}
function followUser(userId) {
  db.prepare(`INSERT OR IGNORE INTO followed_users(user_id) VALUES(?)`).run(userId);
}
function unfollowUser(userId) {
  db.prepare(`DELETE FROM followed_users WHERE user_id = ?`).run(userId);
}
function getFollowedUsers() {
  return db.prepare(`SELECT user_id FROM followed_users`).all().map(r => r.user_id);
}

function parsePostUri(uri) {
  // Expecting format like: pubky://AUTHOR/pub/pubky.app/posts/POST_ID
  const m = uri.match(/^pubky:\/\/([^/]+)\/pub\/[^/]+\/posts\/([^/?#]+)/);
  if (!m) return null;
  return { authorId: m[1], postId: m[2] };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  
  const text = await res.text();
  if (!text || text.trim() === '') {
    log.warn('empty response from API', { url });
    return [];
  }
  
  try {
    return JSON.parse(text);
  } catch (e) {
    log.error('invalid JSON response', { url, text: text.slice(0, 200), error: e.message });
    return [];
  }
}

async function getMentions(limit = 10) {
  const url = `${NEXUS}/v0/user/${encodeURIComponent(PUBLIC_KEY)}/notifications?type=mentioned_by&limit=${limit}`;
  const data = await fetchJson(url);
  const arr = Array.isArray(data) ? data : [];
  log.info('mentions fetched', { count: arr.length });
  return arr;
}

async function getPostContentFromUri(postUri) {
  const ids = parsePostUri(postUri);
  if (!ids) return null;
  // Fallback: scan author's recent posts and match the postId
  try {
    const posts = await getRecentPostsByAuthor(ids.authorId, 20);
    const found = posts.find(p => p?.details?.id === ids.postId);
    return found?.details?.content || found?.content || found?.body || null;
  } catch (e) {
    return null;
  }
}

async function getRecentPostsByAuthor(authorId, limit = 5) {
  const url = `${NEXUS}/v0/stream/posts?source=author&author_id=${encodeURIComponent(authorId)}&limit=${limit}`;
  const data = await fetchJson(url);
  // Expect items with details.uri and details.content per Nexus structure
  return Array.isArray(data) ? data : [];
}

function extractCommandFromText(text) {
  if (!text) return null;
  const t = String(text).toLowerCase().replace(/\s+/g, ' ').trim();
  const pk = (process.env.PUBLIC_KEY || '').toLowerCase();
  if (!pk) return null;
  const token = `pk:${pk}`;
  if (t.includes(`${token} /tag off`)) return 'off';
  if (t.includes(`${token} /tag on`)) return 'on';
  return null;
}

async function sendConfirmationReply(parentUri, cmd) {
  try {
    const mod = await import('./lib/pubky.js');
    const replyFn = mod.replyToPost || (mod.default && mod.default.replyToPost);
    if (!replyFn) return;
    const text = cmd === 'on'
      ? process.env.TAGKY_MSG_FOLLOW_ACTIVATED || '✅ Suivi activé. Je traiterai tes nouveaux posts et publierai des tags.'
      : process.env.TAGKY_MSG_FOLLOW_DEACTIVATED || '✅ Suivi désactivé. Je ne traiterai plus tes nouveaux posts.';
    await replyFn(parentUri, text);
    log.info('replied', { parent_uri: parentUri, cmd });
  } catch (e) {
    log.warn('reply failed', { parent_uri: parentUri, error: e?.message || String(e) });
  }
}

async function sendGuidanceReply(parentUri) {
  try {
    const pubkey = process.env.PUBLIC_KEY;
    const mod = await import('./lib/pubky.js');
    const replyFn = mod.replyToPost || (mod.default && mod.default.replyToPost);
    if (!replyFn || !pubkey) return;
    const text = [
      process.env.TAGKY_MSG_GUIDANCE_INTRO || 'ℹ️ Pour activer le suivi des tags, poste exactement:',
      `pk:${pubkey} ${process.env.TAGKY_MSG_GUIDANCE_ACTIVATE || '/tag on'}`,
      process.env.TAGKY_MSG_GUIDANCE_SEPARATOR || '',
      process.env.TAGKY_MSG_GUIDANCE_DEACTIVATE_INTRO || 'Pour désactiver:',
      `pk:${pubkey} ${process.env.TAGKY_MSG_GUIDANCE_DEACTIVATE || '/tag off'}`
    ].join('\n');
    await replyFn(parentUri, text);
    log.info('guidance replied', { parent_uri: parentUri });
  } catch (e) {
    log.warn('guidance reply failed', { parent_uri: parentUri, error: e?.message || String(e) });
  }
}

async function handleMentions() {
  const mentions = await getMentions(10);
  for (const m of mentions) {
    const postUri = m?.body?.post_uri;
    const authorId = m?.body?.mentioned_by;
    if (!postUri || !authorId) {
      log.warn('mention missing fields', { postUri, authorId });
      continue;
    }
    if (isNotificationProcessed(postUri)) {
      log.debug('mention already processed', { post_uri: postUri, author_id: authorId });
      continue;
    }

    const text = await getPostContentFromUri(postUri);
    const cmd = extractCommandFromText(text);
    log.info('mention received', { author_id: authorId, post_uri: postUri, cmd: cmd ?? 'none', preview: (text ?? '').slice(0,120) });

    // Idempotency: mark as processed BEFORE any side effects to avoid duplicate replies on restarts
    // If a crash happens after this point, we won't reply twice on container restart.
    markNotificationProcessed(postUri);
    if (cmd === 'on') {
      followUser(authorId);
      log.info('followed', { author_id: authorId });
      
      // Ajouter le tag de suivi au profil utilisateur
      try {
        const { tagUserProfile } = await import('./lib/pubky.js');
        await tagUserProfile(authorId, TAGKY_FOLLOW_TAG);
        log.info('user profile tagged with follow tag', { author_id: authorId, tag: TAGKY_FOLLOW_TAG });
      } catch (error) {
        log.warn('failed to tag user profile', { author_id: authorId, tag: TAGKY_FOLLOW_TAG, error: error.message });
      }
      
      await sendConfirmationReply(postUri, 'on');
    } else if (cmd === 'off') {
      unfollowUser(authorId);
      log.info('unfollowed', { author_id: authorId });
      
      // Supprimer le tag de suivi du profil utilisateur
      try {
        const { removeTagFromProfile } = await import('./lib/pubky.js');
        await removeTagFromProfile(authorId, TAGKY_FOLLOW_TAG);
        log.info('user profile tag removed', { author_id: authorId, tag: TAGKY_FOLLOW_TAG });
      } catch (error) {
        log.warn('failed to remove tag from user profile', { author_id: authorId, tag: TAGKY_FOLLOW_TAG, error: error.message });
      }
      
      await sendConfirmationReply(postUri, 'off');
    } else {
      const pubkey = process.env.PUBLIC_KEY;
      const normalized = (text || '').toLowerCase();
      const referencesBot = pubkey && normalized.includes(`pk:${pubkey.toLowerCase()}`);
      const looksLikeTagIntent = normalized.includes('tag') || normalized.includes('/tag');
      if (referencesBot && looksLikeTagIntent) {
        await sendGuidanceReply(postUri);
      }
    }
    // Final safety mark (no-op if already set above)
    markNotificationProcessed(postUri);
  }
}

async function handleFollowedUsersPosts() {
  const users = getFollowedUsers();
  log.info('followed users', { count: users.length });
  for (const userId of users) {
    const posts = await getRecentPostsByAuthor(userId, 5);
    log.debug('posts fetched for author', { author_id: userId, count: posts.length });
    for (const p of posts) {
      const postUri = p?.details?.uri || p?.uri;
      if (!postUri) continue;
      if (isNotificationProcessed(postUri)) continue; // idempotent guard
      const content = p?.details?.content ?? p?.content ?? p?.body ?? null;
      log.info('🆕 new post from followed', {
        author_id: userId,
        post_uri: postUri,
        content_length: (content || '').length,
        preview: String(content || '').slice(0, 120),
      });
      addJob(postUri, content);
      markNotificationProcessed(postUri);
      log.info('📦 queued for AI analysis', { post_uri: postUri });
    }
  }
}

(async function main() {
  try {
    await handleMentions();
    await handleFollowedUsersPosts();
    log.info('✅ fetcher done');
  } catch (e) {
    log.error('❌ fetcher error', { error: e?.message || String(e) });
    process.exitCode = 1;
  } finally {
    db.close();
  }
})();
