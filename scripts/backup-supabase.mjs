#!/usr/bin/env node
/**
 * Supabase backup — dumps all content tables and the theme-assets
 * storage bucket to a timestamped folder under backups/.
 *
 * Usage:  npm run backup
 *
 * Credentials come from .env:
 *   VITE_SUPABASE_URL          (already present)
 *   SUPABASE_SERVICE_ROLE_KEY  (add it: Supabase dashboard -> Settings ->
 *                               API -> service_role. No VITE_ prefix, so
 *                               Vite never bundles it into the client.)
 *
 * Without the service key it falls back to the anon key, which can only
 * read publicly-readable tables (live tables) — draft tables and storage
 * listing will be skipped once creator-only RLS (migration 013) is applied.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'theme-assets';
const PAGE_SIZE = 1000;

const TABLES = [
  'puzzles_draft',
  'assets_draft',
  'asset_versions',
  'puzzles_live',
  'assets_live',
  'daily_schedule',
  'profiles',
  'bug_reports',
  'puzzle_completions',
];

async function loadEnv() {
  const env = {};
  try {
    const raw = await readFile(join(ROOT, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // fall through to process.env
  }
  return { ...env, ...process.env };
}

function headers(key) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function dumpTable(url, key, table) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
      headers: { ...headers(key), Range: `${offset}-${offset + PAGE_SIZE - 1}` },
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function listBucket(url, key, prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const res = await fetch(`${url}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { ...headers(key), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!res.ok) throw new Error(`list ${prefix || '/'}: HTTP ${res.status} ${await res.text()}`);
    const items = await res.json();
    for (const item of items) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) files.push(path);
      else files.push(...(await listBucket(url, key, path)));
    }
    if (items.length < PAGE_SIZE) break;
  }
  return files;
}

async function downloadObject(url, key, path) {
  // Authenticated endpoint first (works with service key even if the
  // bucket is ever made private), public endpoint as fallback.
  for (const endpoint of [`object/${BUCKET}`, `object/public/${BUCKET}`]) {
    const res = await fetch(`${url}/storage/v1/${endpoint}/${path}`, { headers: headers(key) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
  }
  throw new Error(`download failed: ${path}`);
}

const env = await loadEnv();
const url = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const key = serviceKey || env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL / key in .env — see header comment.');
  process.exit(1);
}
if (!serviceKey) {
  console.warn('⚠ No SUPABASE_SERVICE_ROLE_KEY in .env — using anon key.');
  console.warn('  RLS-protected tables silently return 0 rows with the anon key,');
  console.warn('  so this backup may be INCOMPLETE. Add the service key for a full dump.\n');
}

const stamp = new Date().toISOString().replace(/:/g, '-').replace(/\..*$/, '');
const outDir = join(ROOT, 'backups', stamp);
await mkdir(outDir, { recursive: true });

let failures = 0;

for (const table of TABLES) {
  try {
    const rows = await dumpTable(url, key, table);
    await writeFile(join(outDir, `${table}.json`), JSON.stringify(rows, null, 2));
    console.log(`✓ ${table}: ${rows.length} rows`);
  } catch (e) {
    failures++;
    console.warn(`✗ ${table}: ${e.message}`);
  }
}

try {
  const files = await listBucket(url, key);
  let bytes = 0;
  for (const path of files) {
    const data = await downloadObject(url, key, path);
    bytes += data.length;
    const dest = join(outDir, 'storage', BUCKET, ...path.split('/').map(s => s.replace(/[<>:"|?*]/g, '_')));
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, data);
  }
  console.log(`✓ storage/${BUCKET}: ${files.length} files (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
} catch (e) {
  failures++;
  console.warn(`✗ storage/${BUCKET}: ${e.message}`);
}

console.log(`\nBackup ${failures ? `finished with ${failures} failure(s)` : 'complete'}: ${outDir}`);
process.exit(failures ? 1 : 0);
