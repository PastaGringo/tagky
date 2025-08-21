// Prefer .env.local for local development, fallback to .env
// Does not override existing process.env values
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

function tryLoad(p) {
  try {
    if (p && fs.existsSync(p)) {
      dotenv.config({ path: p, override: false });
      return true;
    }
  } catch {}
  return false;
}

// Candidates ordered by priority
const cwd = process.cwd();
const here = path.dirname(new URL(import.meta.url).pathname);
const buildDir = path.resolve(here, '..'); // tagky/build
const repoRootFromBuild = path.resolve(buildDir, '..', '..'); // repo root

const candidates = [
  path.join(cwd, '.env.local'),
  path.join(repoRootFromBuild, '.env.local'),
  path.join(buildDir, '.env.local'),
  path.join(cwd, '.env'),
  path.join(repoRootFromBuild, '.env'),
  path.join(buildDir, '.env'),
];

for (const p of candidates) {
  if (tryLoad(p)) break;
}
