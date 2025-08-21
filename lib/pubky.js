import './load-env.js';
import fs from 'fs';
import bip39 from 'bip39';
import { Client, Keypair } from '@synonymdev/pubky';
import initSpecs, { PubkySpecsBuilder, PubkyAppPostKind } from 'pubky-app-specs';

// Prefer SEED_PHRASE but accept MNEMONIC for backward-compatibility
const expectedPublicKey = process.env.PUBLIC_KEY;

if (!expectedPublicKey) {
  throw new Error('PUBLIC_KEY not found in .env file');
}

async function ensureClient(skipPublicKeyCheck = false) {
  // Lire la seed phrase de manière dynamique pour permettre les modifications runtime
  const mnemonic = process.env.SEED_PHRASE || process.env.MNEMONIC;
  
  if (!mnemonic) {
    throw new Error('Missing seed phrase: set SEED_PHRASE or MNEMONIC environment variable');
  }
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }
  
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const secretKey = seed.subarray(0, 32);
  const keypair = Keypair.fromSecretKey(secretKey);
  const derivedPublicKey = keypair.publicKey().z32();
  if (!skipPublicKeyCheck && derivedPublicKey !== expectedPublicKey) {
    throw new Error(`Derived pubkey mismatch: ${derivedPublicKey} != ${expectedPublicKey}`);
  }

  const client = new Client();
  let session = await client.session(keypair.publicKey());
  if (!session) {
    try {
      await client.signin(keypair);
    } catch (error) {
      let homeserverPublicKey;
      try { homeserverPublicKey = await client.getHomeserver(keypair.publicKey()); } catch { homeserverPublicKey = undefined; }
      if (homeserverPublicKey) {
        await client.republishHomeserver(keypair, homeserverPublicKey);
      }
      await client.signin(keypair);
    }
    session = await client.session(keypair.publicKey());
    if (!session) {
      throw new Error('Failed to get session after authentication');
    }
  }
  return { client, keypair };
}

let wasmReady = false;
async function ensureWasm() {
  if (wasmReady) return;
  const candidates = [
    '../node_modules/pubky-app-specs/pubky_app_specs_bg.wasm',
    '../node_modules/.pnpm/pubky-app-specs@0.3.5/node_modules/pubky-app-specs/pubky_app_specs_bg.wasm',
    '../node_modules/.pnpm/@synonymdev+pubky@0.5.1/node_modules/@synonymdev/pubky/pubky_bg.wasm',
  ];
  let wasmPath;
  for (const p of candidates) {
    const abs1 = new URL(p, import.meta.url).pathname;
    if (fs.existsSync(abs1)) { wasmPath = abs1; break; }
    if (fs.existsSync(p)) { wasmPath = p; break; }
  }
  if (!wasmPath) throw new Error('WASM file not found');
  const wasmBuffer = fs.readFileSync(wasmPath);
  await initSpecs(wasmBuffer);
  wasmReady = true;
}

export async function tagPostWithKeywords(postUri, keywords) {
  if (!postUri) throw new Error('postUri is required');
  const tagList = String(keywords || '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
  if (tagList.length === 0) return;

  await ensureWasm();
  const { client, keypair } = await ensureClient();
  const specs = new PubkySpecsBuilder(keypair.publicKey().z32());

  for (const keyword of tagList) {
    const tagResult = specs.createTag(postUri, keyword);
    const tagJson = tagResult.tag.toJson();
    const tagUrl = tagResult.meta.url;

    const response = await client.fetch(tagUrl, {
      method: 'PUT',
      body: JSON.stringify(tagJson),
      credentials: 'include'
    });
    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Tag publish failed for "${keyword}": ${response.status} - ${responseText}`);
    }
  }
}

export async function tagUserProfile(userId, keywords) {
  if (!userId) throw new Error('userId is required');
  const profileUri = `pubky://${userId}/pub/pubky.app/profile.json`;
  return await tagPostWithKeywords(profileUri, keywords);
}

export async function removeTagFromProfile(userId, keyword) {
  if (!userId) throw new Error('userId is required');
  if (!keyword) throw new Error('keyword is required');
  
  await ensureWasm();
  const { client, keypair } = await ensureClient();
  
  // Utiliser PubkySpecsBuilder pour générer l'URL correcte du tag
  const { PubkySpecsBuilder } = await import('pubky-app-specs');
  const specs = new PubkySpecsBuilder(keypair.publicKey().z32());
  
  const profileUri = `pubky://${userId}/pub/pubky.app/profile.json`;
  const tagResult = specs.createTag(profileUri, keyword);
  const tagUrl = tagResult.meta.url;
  
  const response = await client.fetch(tagUrl, {
    method: 'DELETE',
    credentials: 'include'
  });
  
  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Tag removal failed for "${keyword}": ${response.status} - ${responseText}`);
  }
}

export async function removeTagFromPost(postUri, keyword) {
  if (!postUri) throw new Error('postUri is required');
  if (!keyword) throw new Error('keyword is required');
  
  await ensureWasm();
  const { client, keypair } = await ensureClient();
  
  // Utiliser PubkySpecsBuilder pour générer l'URL correcte du tag
  const { PubkySpecsBuilder } = await import('pubky-app-specs');
  const specs = new PubkySpecsBuilder(keypair.publicKey().z32());
  
  const tagResult = specs.createTag(postUri, keyword);
  const tagUrl = tagResult.meta.url;
  
  const response = await client.fetch(tagUrl, {
    method: 'DELETE',
    credentials: 'include'
  });
  
  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Tag removal failed for "${keyword}" from post: ${response.status} - ${responseText}`);
  }
}

export async function createPost(text, skipPublicKeyCheck = false) {
  if (!text) throw new Error('createPost requires text');
  await ensureWasm();
  const { client, keypair } = await ensureClient(skipPublicKeyCheck);

  const specs = new PubkySpecsBuilder(keypair.publicKey().z32());
  const result = specs.createPost(
    text,
    PubkyAppPostKind.Short,
    null, // pas de parent pour un post principal
    null,
    null
  );
  const postJson = result.post.toJson();
  const postUrl = result.meta.url;

  const response = await client.fetch(postUrl, {
    method: 'PUT',
    body: JSON.stringify(postJson),
    credentials: 'include'
  });
  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Post creation failed: ${response.status} - ${responseText}`);
  }
  return result.meta;
}

export async function replyToPost(parentPostUri, text) {
  if (!parentPostUri || !text) throw new Error('replyToPost requires parentPostUri and text');
  await ensureWasm();
  const { client, keypair } = await ensureClient();

  const specs = new PubkySpecsBuilder(keypair.publicKey().z32());
  const result = specs.createPost(
    text,
    PubkyAppPostKind.Short,
    parentPostUri,
    null,
    null
  );
  const postJson = result.post.toJson();
  const postUrl = result.meta.url;

  const response = await client.fetch(postUrl, {
    method: 'PUT',
    body: JSON.stringify(postJson),
    credentials: 'include'
  });
  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Reply failed: ${response.status} - ${responseText}`);
  }
  return result.meta;
}

export default { tagPostWithKeywords, tagUserProfile, replyToPost, createPost, removeTagFromProfile, removeTagFromPost };
