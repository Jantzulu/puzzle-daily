#!/usr/bin/env node
/**
 * SELF-HOSTED WEB FONTS — no visitor's browser ever contacts Google.
 *
 * The game used to load its fonts from fonts.googleapis.com, which hands
 * every visitor's IP address to Google (a GDPR problem in the EU: LG München
 * I, 3 O 17493/20). This script fetches the same families ONCE, at authoring
 * time, from Google Fonts, keeps the Latin + Latin-Extended subsets, and
 * writes:
 *   public/fonts/<slug>/*.woff2       the font files, served from our domain
 *   public/fonts/<slug>/<LICENSE>     each family's license (OFL etc.),
 *                                     shipped alongside the files it covers
 *   public/fonts/fonts.css            the @font-face rules, linked from the
 *                                     <head> of both entry pages (so the
 *                                     pre-hydration splash has its font
 *                                     before any JavaScript runs)
 *
 * Declaring a family costs nothing at runtime: a browser downloads a face
 * only when text on screen uses it, so the Theme editor's full menu of
 * choices can stay self-hosted while players fetch just the theme's fonts.
 *
 * TO ADD OR CHANGE A FONT (e.g. a new Theme editor choice): edit FAMILIES
 * (Google Fonts css2 syntax), run `node scripts/self-host-fonts.mjs`, and
 * commit public/fonts. The theme font lists live in
 * src/utils/themeAssets.ts and src/components/editor/ThemeAssetsEditor.tsx.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = join(ROOT, 'public', 'fonts');
const CSS_OUT = join(FONT_DIR, 'fonts.css');

const FAMILIES = [
  'Almendra:wght@400;700',
  'Amarante',
  'Caveat:wght@400;500;600;700',
  'Cinzel:wght@400;500;600;700',
  'Crimson Text:wght@400;600;700',
  'Faculty Glyphic',
  'Germania One',
  'Grenze Gotisch:wght@400;500;600;700',
  'Inter:wght@400;500;600;700',
  'Jacquard 12',
  'Jacquard 24',
  'Jacquarda Bastarda 9',
  'MedievalSharp',
  'Metamorphous',
  'Modern Antiqua',
  'Press Start 2P',
  'UnifrakturCook:wght@700',
];

// English and the European languages; other scripts fall back to the
// system font (Google serves those subsets too — add them here if needed).
const SUBSETS = ['latin', 'latin-ext'];

// A current desktop Chrome, so Google answers with woff2.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const slugOf = (family) => family.toLowerCase().replace(/[^a-z0-9]/g, '');

async function get(url, as) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.text();
}

const cssUrl = 'https://fonts.googleapis.com/css2?'
  + FAMILIES.map(f => 'family=' + f.replace(/ /g, '+')).join('&')
  + '&display=swap';
const googleCss = await get(cssUrl);

// Google's css2 answer: one `/* subset */ @font-face { ... }` block per
// family × weight × subset. Variable families repeat the same file URL for
// every requested weight.
const faces = [];
for (const m of googleCss.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
  const [, subset, body] = m;
  if (!SUBSETS.includes(subset)) continue;
  const field = (name) => body.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
  faces.push({
    subset,
    family: field('font-family').replace(/^'|'$/g, ''),
    style: field('font-style'),
    weight: field('font-weight'),
    url: body.match(/url\(([^)]+)\)/)[1],
    unicodeRange: field('unicode-range'),
  });
}
if (faces.length === 0) throw new Error('No faces parsed — did Google change its CSS format?');

// One local file per distinct remote file.
const weightsByUrl = new Map();
for (const f of faces) weightsByUrl.set(f.url, [...(weightsByUrl.get(f.url) ?? []), f.weight]);
const localName = new Map();
for (const f of faces) {
  if (localName.has(f.url)) continue;
  const weights = weightsByUrl.get(f.url);
  const tag = weights.length > 1 ? 'var' : f.weight;
  localName.set(f.url, `${slugOf(f.family)}/${slugOf(f.family)}-${f.subset}-${f.style === 'italic' ? 'italic-' : ''}${tag}.woff2`);
}

await rm(FONT_DIR, { recursive: true, force: true });
let bytes = 0;
for (const [url, name] of localName) {
  const buf = await get(url, 'buffer');
  await mkdir(dirname(join(FONT_DIR, name)), { recursive: true });
  await writeFile(join(FONT_DIR, name), buf);
  bytes += buf.length;
}

// Each family's license, from the google/fonts repository.
const families = [...new Set(faces.map(f => f.family))];
const licenses = {};
for (const family of families) {
  const slug = slugOf(family);
  const candidates = [['ofl', 'OFL.txt'], ['apache', 'LICENSE.txt'], ['ufl', 'UFL.txt']];
  let found = null;
  for (const [dir, file] of candidates) {
    const res = await fetch(`https://raw.githubusercontent.com/google/fonts/main/${dir}/${slug}/${file}`);
    if (res.ok) { found = { file, text: await res.text() }; break; }
  }
  if (!found) throw new Error(`No license found for ${family}`);
  await writeFile(join(FONT_DIR, slug, found.file), found.text);
  licenses[family] = found.file;
}

const header = `/*
 * SELF-HOSTED WEB FONTS — generated by scripts/self-host-fonts.mjs; do not
 * edit by hand (edit the script's FAMILIES and rerun it). Files and each
 * family's license live in public/fonts/<family>/. Linked from both entry
 * pages' <head>; served from our own domain, so no visitor request ever
 * reaches Google.
 */
`;
const rules = faces.map(f => `/* ${f.subset} */
@font-face {
  font-family: '${f.family}';
  font-style: ${f.style};
  font-weight: ${f.weight};
  font-display: swap;
  src: url('/fonts/${localName.get(f.url)}') format('woff2');
  unicode-range: ${f.unicodeRange};
}`).join('\n');
await writeFile(CSS_OUT, header + rules + '\n');

console.log(`${families.length} families, ${faces.length} @font-face rules, ${localName.size} files, ${(bytes / 1024).toFixed(0)} KB`);
for (const fam of families) console.log(`  ${fam}: ${licenses[fam]}`);
