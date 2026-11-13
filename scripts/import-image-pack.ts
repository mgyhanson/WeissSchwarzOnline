/**
 * Adds a pack of card images the owner provided (e.g. the 102-image ZIP).
 *
 *   node scripts/import-image-pack.ts <path to the .zip>
 *
 * The ZIP is extracted into its own temporary folder (nothing in it is run),
 * then for each row of its manifest CSV:
 *  - the card id must exist in the card database (official.json files);
 *  - the file must match the manifest's SHA-256 and the pack's SHA256SUMS;
 *  - the image must decode (scripts/images-lib.ts);
 *  - it is copied unchanged to card-assets/local.nosync/<card>.png, unless a
 *    picture for that card already exists (never overwritten; a different
 *    existing file is reported).
 * Images are matched by the card id column, never by file order or name
 * similarity. The original ZIP is copied to data.nosync/originals/.
 * Results: card-assets/local.nosync/image-index.json and
 * reports/card_image_pack_report.json.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkImage, fileStem, sha256 } from './images-lib.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'card-assets/local.nosync');
const zip = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !existsSync(zip)) {
  console.error('Usage: node scripts/import-image-pack.ts <path to the .zip>');
  process.exit(1);
}
const today = new Date().toISOString().slice(0, 10);

// Card ids in the database.
const known = new Map<string, string>();
for (const folder of readdirSync(join(ROOT, 'card-database/sets'))) {
  const file = join(ROOT, 'card-database/sets', folder, 'official.json');
  if (!existsSync(file)) continue;
  for (const card of (JSON.parse(readFileSync(file, 'utf8')) as { cards: { no: string; picture: string }[] }).cards) known.set(card.no, card.picture);
}

// Unsafe paths are refused before extracting.
const listing = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);
const unsafe = listing.filter((p) => p.startsWith('/') || p.split('/').includes('..'));
if (unsafe.length > 0) throw new Error(`ZIP contains unsafe paths: ${unsafe.join(', ')}`);
execFileSync('unzip', ['-tq', zip]); // CRC check of every member
const work = mkdtempSync(join(tmpdir(), 'wso-image-pack-'));
execFileSync('unzip', ['-q', zip, '-d', work]);

try {
  const manifestPath = listing.find((p) => p.endsWith('.csv'));
  if (!manifestPath) throw new Error('No manifest CSV in the ZIP');
  const packRoot = join(work, dirname(manifestPath));
  const sums = new Map<string, string>();
  const sumsPath = listing.find((p) => basename(p) === 'SHA256SUMS.txt');
  if (sumsPath) {
    for (const line of readFileSync(join(work, sumsPath), 'utf8').split('\n')) {
      const m = /^([0-9a-f]{64})\s+(.+)$/.exec(line.trim());
      if (m) sums.set(m[2]!, m[1]!);
    }
  }
  const rows = readFileSync(join(work, manifestPath), 'utf8').replace(/^﻿/, '').trim().split('\n');
  const header = rows[0]!.split(',');
  const col = (name: string) => header.indexOf(name);

  const indexFile = join(ART, 'image-index.json');
  const index = existsSync(indexFile) ? (JSON.parse(readFileSync(indexFile, 'utf8')) as Record<string, unknown>) : {};
  const report = { zip: basename(zip), zipSha256: sha256(readFileSync(zip)), checkedOn: today, rows: rows.length - 1, copied: [] as string[], alreadyPresentSame: [] as string[], alreadyPresentDifferent: [] as string[], problems: [] as string[] };
  mkdirSync(ART, { recursive: true });

  for (const row of rows.slice(1)) {
    const cells = row.split(',');
    const cardId = cells[col('card_id')]!;
    const localFile = cells[col('local_file')]!;
    const expected = cells[col('sha256')]!;
    const source = cells[col('source_url')] ?? '';
    const collection = cells[col('collection')] ?? '';
    try {
      if (!known.has(cardId)) throw new Error('card id not in the database');
      if (fileStem(cardId) !== basename(localFile).replace(/\.[^.]+$/, '')) throw new Error(`file name ${localFile} does not belong to this card id`);
      if (source && !source.endsWith(known.get(cardId)!)) throw new Error(`source ${source} is not this card's official picture path ${known.get(cardId)}`);
      const buf = readFileSync(join(packRoot, localFile));
      const hash = sha256(buf);
      if (hash !== expected) throw new Error('SHA-256 differs from the manifest');
      if (sums.size > 0 && sums.get(localFile) !== hash) throw new Error('SHA-256 differs from SHA256SUMS.txt');
      const info = checkImage(buf);
      const target = `${fileStem(cardId)}.${info.format === 'png' ? 'png' : 'jpg'}`;
      const existing = readdirSync(ART).find((f) => f.replace(/\.[^.]+$/, '') === fileStem(cardId));
      if (existing) {
        const same = sha256(readFileSync(join(ART, existing))) === hash;
        (same ? report.alreadyPresentSame : report.alreadyPresentDifferent).push(cardId);
        continue;
      }
      copyFileSync(join(packRoot, localFile), join(ART, target));
      index[cardId] = { file: target, sha256: hash, bytes: buf.length, ...info, source: 'user-zip', url: source || null, recordedOn: today, status: 'VERIFIED', pack: basename(zip), collection };
      report.copied.push(cardId);
    } catch (error) {
      report.problems.push(`${cardId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
  const sourcesFile = join(ART, 'sources.json');
  const sources = existsSync(sourcesFile) ? (JSON.parse(readFileSync(sourcesFile, 'utf8')) as Record<string, unknown>) : {};
  for (const cardId of report.copied) {
    const entry = index[cardId] as { file: string; url: string | null };
    sources[entry.file] = { source: '官方卡表圖片（使用者提供的 102 張整合包）', licence: '使用者表示已取得使用許可；只在本機使用', note: entry.url ?? '' };
  }
  writeFileSync(sourcesFile, `${JSON.stringify(sources, null, 2)}\n`);
  mkdirSync(join(ROOT, 'data.nosync/originals'), { recursive: true });
  copyFileSync(zip, join(ROOT, 'data.nosync/originals', basename(zip)));
  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  writeFileSync(join(ROOT, 'reports/card_image_pack_report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`rows ${report.rows}, copied ${report.copied.length}, already present (same) ${report.alreadyPresentSame.length}, already present (different) ${report.alreadyPresentDifferent.length}, problems ${report.problems.length}`);
  for (const p of report.problems) console.log(`  ${p}`);
  if (report.problems.length > 0) process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
