/**
 * Translate daxfb game data using zh_en.json.
 * Decompresses the pako/zlib base64 game data, translates all labels,
 * re-compresses, and writes back to game.js.
 *
 * Usage: node scripts/translateDaxfbData.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pako from 'pako';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load translation map
const zhPath = path.join(ROOT, 'public', 'zh_en.json');
const zh = JSON.parse(fs.readFileSync(zhPath, 'utf8'));
console.log(`Loaded ${Object.keys(zh).length} translations from zh_en.json`);

// Stats
let translated = 0;
let untranslated = 0;
const missing = new Set();

function t(key) {
  if (!key) return key;
  const result = zh[key];
  if (result) {
    translated++;
    return result;
  }
  untranslated++;
  missing.add(key);
  return key;
}

// Read game.js
const gameJsPath = path.join(ROOT, 'public', 'daxfb', 'games', 'coi', 'game.js');
let content = fs.readFileSync(gameJsPath, 'utf8');

// Extract the base64 compressed data
// Pattern: const c="BASE64_STRING"
const match = content.match(/const c="([^"]+)"/);
if (!match) {
  console.error('ERROR: Could not find compressed data in game.js');
  process.exit(1);
}

const b64 = match[1];
console.log(`Compressed data: ${b64.length} chars base64`);

// URL-safe base64 to standard
const stdB64 = b64.replace(/[-_]/g, c => c === '-' ? '+' : '/');

// Decode base64 → Uint8Array
const compressed = Buffer.from(stdB64, 'base64');
console.log(`Decoded: ${compressed.length} bytes compressed`);

// Decompress with pako (zlib)
const decompressed = pako.inflate(compressed);
const text = Buffer.from(decompressed).toString('utf8');
console.log(`Decompressed: ${text.length} chars`);

// Parse JSON
const data = JSON.parse(text);
console.log(`Data keys: ${Object.keys(data).join(', ')}`);

// Translate items
if (data.items) {
  console.log(`Translating ${data.items.length} items...`);
  for (const item of data.items) {
    if (item.label) {
      item.label = t(item.label);
    }
  }
}

// Translate recipeDictionaries
if (data.recipeDictionaries) {
  console.log(`Translating ${data.recipeDictionaries.length} recipe dictionaries...`);
  for (const rd of data.recipeDictionaries) {
    if (rd.label) rd.label = t(rd.label);
    if (rd.recipes) {
      for (const r of rd.recipes) {
        if (r.label) r.label = t(r.label);
      }
    }
  }
}

// Translate logistic
if (data.logistic) {
  console.log(`Translating ${data.logistic.length} logistic entries...`);
  for (const l of data.logistic) {
    if (l.label) l.label = t(l.label);
    if (l.transport) {
      for (const tr of l.transport) {
        if (tr.label) tr.label = t(tr.label);
      }
    }
  }
}

// Translate description
if (data.description) {
  if (data.description.description) {
    data.description.description = t(data.description.description);
  }
}

console.log(`Translated: ${translated}, Untranslated: ${untranslated}`);
if (missing.size > 0) {
  console.log(`Missing translations (${missing.size}):`);
  const sorted = [...missing].sort();
  for (const m of sorted.slice(0, 30)) {
    console.log(`  "${m}"`);
  }
  if (sorted.length > 30) {
    console.log(`  ... and ${sorted.length - 30} more`);
  }
}

// Re-compress
const jsonStr = JSON.stringify(data);
const recompressed = pako.deflate(jsonStr);
const newB64 = Buffer.from(recompressed).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
console.log(`Re-compressed: ${newB64.length} chars base64`);

// Replace in game.js
const newContent = content.replace(/const c="[^"]+"/, `const c="${newB64}"`);
fs.writeFileSync(gameJsPath, newContent, 'utf8');
console.log(`Written: ${gameJsPath}`);
console.log('Done!');
