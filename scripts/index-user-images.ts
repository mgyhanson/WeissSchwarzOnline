/**
 * Lists pictures you put into the picture folder yourself in its index, so
 * that the picture service serves them (it serves only indexed files).
 *
 *   node scripts/index-user-images.ts            (npm run cards:images:index)
 *   USER_ART_DIR=/some/folder node scripts/index-user-images.ts
 *
 * A file is added when its name is a card id of the database with "/"
 * written as "_" (SY/W08-T06 → SY_W08-T06.png; png, jpg, jpeg or webp), the
 * card has no picture in the index yet, and (png, jpeg) the image decodes.
 * Nothing is renamed, changed, moved or overwritten; existing entries stay.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkImage, fileStem, sha256 } from './images-lib.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = resolve(process.env.USER_ART_DIR ?? join(ROOT, 'card-assets/local.nosync'));
const today = new Date().toISOString().slice(0, 10);

if (!existsSync(ART)) {
  console.error(`No picture folder: ${ART}`);
  process.exit(1);
}

// File stem → card id, for every card of the database.
const byStem = new Map<string, string>();
for (const folder of readdirSync(join(ROOT, 'card-database/sets'))) {
  const file = join(ROOT, 'card-database/sets', folder, 'official.json');
  if (!existsSync(file)) continue;
  for (const card of (JSON.parse(readFileSync(file, 'utf8')) as { cards: { no: string }[] }).cards) byStem.set(fileStem(card.no), card.no);
}

type Entry = { file: string } & Record<string, unknown>;
const indexFile = join(ART, 'image-index.json');
const index = existsSync(indexFile) ? (JSON.parse(readFileSync(indexFile, 'utf8')) as Record<string, Entry>) : {};
const listed = new Set(Object.values(index).map((entry) => entry.file));
const added: string[] = [];
const skipped: string[] = [];

for (const file of readdirSync(ART).sort()) {
  const match = /^(.+)\.(png|jpe?g|webp)$/i.exec(file);
  if (!match || listed.has(file)) continue;
  const cardId = byStem.get(match[1]!);
  try {
    if (!cardId) throw new Error('the name is not a card id of the database');
    if (index[cardId]) throw new Error(`${cardId} already has the picture ${index[cardId].file}`);
    const buf = readFileSync(join(ART, file));
    const webp = match[2]!.toLowerCase() === 'webp';
    if (webp && !(buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP')) throw new Error('not a WebP file');
    const info = webp ? { format: 'webp' } : checkImage(buf);
    index[cardId] = { file, sha256: sha256(buf), bytes: buf.length, ...info, source: 'user-file', url: null, recordedOn: today, status: 'USER_PROVIDED' };
    added.push(`${cardId} ← ${file}`);
  } catch (error) {
    skipped.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (added.length > 0) writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
console.log(`added ${added.length}, skipped ${skipped.length}, index now lists ${Object.keys(index).length} pictures`);
for (const line of added) console.log(`  + ${line}`);
for (const line of skipped) console.log(`  - ${line}`);
