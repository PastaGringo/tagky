#!/usr/bin/env node
import './lib/load-env.js';
import Database from 'better-sqlite3';
import { createLogger } from './lib/logger.js';
import { createPost, tagPostWithKeywords, removeTagFromPost } from './lib/pubky.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma2:2b';
const PROMPT_TEMPLATE = process.env.LLM_KEYWORD_PROMPT || `From the following French text, output EXACTLY three keywords for tagging. RULES: (1) Output ONLY the three keywords, (2) separated by semicolons ';', (3) no numbering, no bullets, no quotes, no explanations, (4) replace spaces in keywords with hyphens. Example: mot-cle-1;mot-cle-2;mot-cle-3. Text: "{{TEXT}}"`;
const NEXUS_API_URL = process.env.NEXUS_API_URL || 'https://nexus.pubky.app';
const TAGKY_FOLLOW_TAG = process.env.TAGKY_FOLLOW_TAG || 'tagky-👀';
const TAGKY_PENDING_TAG = process.env.TAGKY_PENDING_TAG || 'tagky-⏳';

const db = new Database(new URL('./queue.db', import.meta.url).pathname);
const log = createLogger('worker');

async function verifyOllama() {
  const url = `${OLLAMA_URL.replace(/\/$/, '')}/api/tags`;
  try {
    // Prefer GET /api/tags (supported by Ollama >=0.1.30). If server rejects GET, fallback to POST.
    let res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      res = await fetch(url, { method: 'POST' });
    }
    if (!res.ok) {
      throw new Error(`unexpected status ${res.status}`);
    }
    const data = await res.json();
    const names = Array.isArray(data?.models)
      ? data.models.map(m => m?.name).filter(Boolean)
      : Array.isArray(data)
        ? data.map(m => m?.name).filter(Boolean)
        : [];
    const hasModel = names.includes(OLLAMA_MODEL);
    if (!hasModel) {
      throw new Error(`model not found: ${OLLAMA_MODEL}`);
    }
    log.info('ollama ready', { url: OLLAMA_URL, model: OLLAMA_MODEL });
  } catch (e) {
    log.error('ollama check failed', { url: OLLAMA_URL, model: OLLAMA_MODEL, error: e?.message || String(e) });
    throw e;
  }
}

function normalize3Keywords(raw) {
  if (raw == null) raw = '';
  let s = String(raw)
    .replace(/\r/g, '')
    .trim();

  // Try to extract plausible keywords from common formats
  let parts = [];
  // JSON array
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j)) parts = j.map(String);
    else if (j && Array.isArray(j.keywords)) parts = j.keywords.map(String);
  } catch (_) {}
  // Bullet list or lines
  if (parts.length === 0 && /\n|•|-\s/.test(s)) {
    parts = s.split(/\n|•|\*|-\s/).map(t => t.trim()).filter(Boolean);
  }
  // Semicolon or comma separated
  if (parts.length === 0) {
    if (s.includes(';')) parts = s.split(';');
    else if (s.includes(',')) parts = s.split(',');
  }
  // Fallback: spaces
  if (parts.length === 0) parts = s.split(/\s+/);

  const cleaned = parts
    .map(t => t.toLowerCase())
    .map(t => t.replace(/["'`*_]/g, ''))
    .map(t => t.replace(/\s+/g, '-'))
    .map(t => t.replace(/[^a-z0-9àâäéèêëïîôöùûüÿçñ-]/g, ''))
    .map(t => t.replace(/-+/g, '-'))
    .map(t => t.replace(/^-+|-+$/g, ''))  // Remove leading and trailing hyphens
    .map(t => t.trim())
    .filter(Boolean);

  const unique = Array.from(new Set(cleaned)).slice(0, 3);
  // Return 1 to 3 keywords based on what was found, no padding with 'tag'
  if (unique.length === 0) unique.push('tag'); // Only add fallback if no keywords found
  return unique.join(';');
}

async function callOllama(text) {
  const prompt = PROMPT_TEMPLATE.replace('{{TEXT}}', text || '');
  log.debug('prompt sent to Ollama', { 
    text_length: (text || '').length, 
    text_preview: (text || '').slice(0, 200),
    prompt_length: prompt.length,
    prompt_preview: prompt.slice(0, 300)
  });
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false })
  });
  if (!res.ok) throw new Error(`OLLAMA HTTP ${res.status}`);
  const data = await res.json();
  const out = data?.response ?? data?.choices?.[0]?.text ?? '';
  return String(out);
}

function getPendingJobs(limit = 5) {
  return db.prepare(`SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at LIMIT ?`).all(limit);
}
function markProcessing(id) {
  db.prepare(`UPDATE jobs SET status='processing', attempts=attempts+1 WHERE id=?`).run(id);
}
function markDone(id, keywords) {
  const kw = String(keywords || '');
  const job = db.prepare(`SELECT post_uri FROM jobs WHERE id = ?`).get(id);
  const tx = db.transaction(() => {
    db.prepare(`UPDATE jobs SET status='done', processed_at=datetime('now'), keywords=? WHERE id=?`).run(kw, id);
    const postUri = job.post_uri;
    const arr = kw.split(';').map(s => s.trim()).filter(Boolean);
    for (const k of arr) {
      db.prepare(`INSERT OR IGNORE INTO tags(post_uri, keyword) VALUES(?, ?)`).run(postUri, k);
    }
  });
  tx();
}
function markError(id, err) {
  db.prepare(`UPDATE jobs SET status='error', last_error=? WHERE id=?`).run(String(err).slice(0, 1000), id);
}

function markIgnored(id, reason) {
  db.prepare(`UPDATE jobs SET status='ignored', last_error=? WHERE id=?`).run(String(reason).slice(0, 1000), id);
}

// Fonction pour vérifier si un utilisateur a le tag de suivi
async function hasFollowTag(userId) {
  try {
    const url = `${NEXUS_API_URL}/v0/user/${userId}/tags?limit_tags=100`;
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      log.warn('failed to fetch user tags', { user_id: userId, status: response.status });
      return false;
    }
    
    const tags = await response.json();
    if (!Array.isArray(tags)) {
      log.warn('unexpected tags response format', { user_id: userId, tags });
      return false;
    }
    
    const hasTag = tags.some(tag => tag.label === TAGKY_FOLLOW_TAG);
    log.debug('follow tag check', { user_id: userId, has_tag: hasTag, follow_tag: TAGKY_FOLLOW_TAG });
    return hasTag;
  } catch (error) {
    log.error('error checking follow tag', { user_id: userId, error: error.message });
    return false;
  }
}

function parsePostUri(uri) {
  // Expecting format like: pubky://AUTHOR/pub/pubky.app/posts/POST_ID
  const m = uri.match(/^pubky:\/\/([^/]+)\/pub\/[^/]+\/posts\/([^/?#]+)/);
  if (!m) return null;
  return { authorId: m[1], postId: m[2] };
}

function isUserFollowed(userId) {
  const row = db.prepare(`SELECT 1 FROM followed_users WHERE user_id = ?`).get(userId);
  return !!row;
}

async function sendUnfollowExplanation(postUri) {
  try {
    const parsed = parsePostUri(postUri);
    if (!parsed) {
      log.warn('cannot parse post URI for unfollow explanation', { post_uri: postUri });
      return;
    }
    
    const message = process.env.TAGKY_MSG_UNFOLLOW_EXPLANATION || `Désolé, je ne peux pas taguer ce post car le suivi a été désactivé pendant le traitement. Pour réactiver le tagging automatique, mentionnez-moi avec "/tag on".`;
    
    await createPost({
      content: message,
      parent: postUri
    });
    
    log.info('📝 unfollow explanation sent', { 
      post_uri: postUri, 
      author_id: parsed.authorId 
    });
  } catch (error) {
    log.error('failed to send unfollow explanation', { 
      post_uri: postUri, 
      error: error.message 
    });
  }
}

(async function main() {
  try {
    await verifyOllama();
    const jobs = getPendingJobs(10);
    if (jobs.length === 0) {
      log.info('📋 no pending jobs');
      return;
    }
    log.info('processing batch', { size: jobs.length, model: OLLAMA_MODEL, url: OLLAMA_URL });
    let ok = 0;
    for (const j of jobs) {
      try {
        markProcessing(j.id);
        
        // Skip empty-content posts (e.g., reposts with no text)
        if (!j.content || String(j.content).trim().length === 0) {
          log.info('↩️ skip empty-content job (no tagging)', { id: j.id, post_uri: j.post_uri });
          markIgnored(j.id, 'Empty content - skip tagging');
          continue;
        }

        // Ajouter le tag "en attente" au post
        try {
          await tagPostWithKeywords(j.post_uri, TAGKY_PENDING_TAG);
          log.info('⏳ post tagged as pending', { id: j.id, post_uri: j.post_uri, tag: TAGKY_PENDING_TAG });
        } catch (error) {
          log.warn('failed to add pending tag', { id: j.id, post_uri: j.post_uri, error: error.message });
        }
        
        // Vérifier si l'utilisateur est encore suivi avant de traiter
        const parsed = parsePostUri(j.post_uri);
        if (parsed && !isUserFollowed(parsed.authorId)) {
          log.info('🚫 user no longer followed, sending explanation', { 
            id: j.id, 
            post_uri: j.post_uri, 
            author_id: parsed.authorId 
          });
          
          await sendUnfollowExplanation(j.post_uri);
          markError(j.id, 'User no longer followed - explanation sent');
          continue;
        }
        
        // Vérifier si l'utilisateur a encore le tag de suivi
        if (parsed && !(await hasFollowTag(parsed.authorId))) {
          log.info('🏷️ user missing follow tag, marking as ignored', { 
            id: j.id, 
            post_uri: j.post_uri, 
            author_id: parsed.authorId,
            follow_tag: TAGKY_FOLLOW_TAG
          });
          
          markIgnored(j.id, `User missing follow tag: ${TAGKY_FOLLOW_TAG}`);
          continue;
        }
        
        const parseUtc = (s) => {
          if (!s) return null;
          return Date.parse(String(s).replace(' ', 'T') + 'Z');
        };
        const tCreated = parseUtc(j.created_at);
        const tAnalyzeStart = Date.now();
        log.info('🔎 analyzing with Ollama', { id: j.id, model: OLLAMA_MODEL, url: OLLAMA_URL });
        const ai = await callOllama(j.content || '');
        const tAnalyzeEnd = Date.now();
        log.debug('ollama raw response', { id: j.id, size: (ai || '').length });
        const kw = normalize3Keywords(ai);
        log.info('🏷️ normalized keywords', { id: j.id, keywords: kw });
        
        // Supprimer le tag "en attente" et ajouter les vrais tags
        try {
          await removeTagFromPost(j.post_uri, TAGKY_PENDING_TAG);
          log.info('✅ pending tag removed', { id: j.id, post_uri: j.post_uri, tag: TAGKY_PENDING_TAG });
        } catch (error) {
          log.warn('failed to remove pending tag', { id: j.id, post_uri: j.post_uri, error: error.message });
        }
        
        const tDone = Date.now();
        markDone(j.id, kw);
        const tags = kw.split(';').map(s => s.trim()).filter(Boolean);
        const timings = {
          detect_to_analyze_start: (tCreated && tAnalyzeStart) ? (tAnalyzeStart - tCreated) : null,
          analyze_ms: tAnalyzeEnd - tAnalyzeStart,
          detect_to_done: (tCreated && tDone) ? (tDone - tCreated) : null,
        };
        log.info('✅ job done', { id: j.id, post_uri: j.post_uri, tags, timings_ms: timings });
        ok++;
      } catch (e) {
        markError(j.id, e?.message || String(e));
        log.error('❌ job error', { id: j.id, error: e?.message || String(e) });
      }
    }
    log.info('batch summary', { attempted: jobs.length, success: ok, failed: jobs.length - ok });
  } catch (e) {
    log.error('❌ worker fatal', { error: e?.message || String(e) });
    process.exitCode = 1;
  } finally {
    db.close();
  }
})();
