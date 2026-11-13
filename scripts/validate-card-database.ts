/**
 * Checks the card database files and the local card images against each
 * other, and writes reports/card_database_validation.json.
 *
 *   node scripts/validate-card-database.ts        (npm run cards:validate)
 *
 * Checks, per set (card-database/sets/<folder>/official.json):
 *  - the stored checksum matches the cards (data unchanged since import);
 *  - no card number twice, in the set or across sets;
 *  - every card has its number, name, kind, colour and picture path, and a
 *    kind the game knows; characters have level, cost, power and soul;
 *  - an imported booster holds exactly the base cards the official list
 *    showed, all with the set's code.
 * And for the images in card-assets/local.nosync (not in Git):
 *  - every card has a picture file, listed in image-index.json with the
 *    same SHA-256, that decodes;
 *  - no picture file without a card, no index entry without a file;
 *  - the recorded source is the card's own official picture path.
 * Exit code 1 when a data check fails. Missing pictures are listed but do
 * not fail the check: the game then draws its own card face.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkImage, fileStem, sha256 } from './images-lib.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETS = join(ROOT, 'card-database/sets');
const ART = join(ROOT, 'card-assets/local.nosync');

interface Card {
  no: string;
  name: string;
  kind: string;
  color: string;
  level: string;
  cost: string;
  power: string;
  soul: string;
  picture: string;
  text: string;
}
interface SetFile {
  source: { product: string; sha256OfCompactCards: string; expansion?: number; listedEntries?: number; parallelEntries?: number; released?: string };
  cards: Card[];
}

const problems: string[] = [];
const seen = new Map<string, string>();
const index = existsSync(join(ART, 'image-index.json')) ? (JSON.parse(readFileSync(join(ART, 'image-index.json'), 'utf8')) as Record<string, { file: string; sha256: string; url: string | null; source: string }>) : {};
const files = existsSync(ART) ? readdirSync(ART).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)) : [];
const fileOf = new Map(files.map((f) => [f.replace(/\.[^.]+$/, ''), f]));
const used = new Set<string>();
/** Characters printed without a soul icon (soul 0). */
const noSoul: string[] = [];

const sets = readdirSync(SETS)
  .filter((folder) => existsSync(join(SETS, folder, 'official.json')))
  .map((folder) => {
    const set = JSON.parse(readFileSync(join(SETS, folder, 'official.json'), 'utf8')) as SetFile;
    if (sha256(JSON.stringify(set.cards)) !== set.source.sha256OfCompactCards) problems.push(`${folder}: checksum does not match the stored cards`);
    const codes = new Set<string>();
    const kinds: Record<string, number> = {};
    const images = { present: 0, verified: 0, missing: [] as string[], problems: [] as string[] };
    for (const card of set.cards) {
      if (seen.has(card.no)) problems.push(`${card.no}: in ${seen.get(card.no)} and in ${folder}`);
      seen.set(card.no, folder);
      codes.add(card.no.split('-')[0] ?? '');
      const kind = { '2': 'CHARACTER', '3': 'EVENT', '4': 'CLIMAX' }[card.kind];
      if (!kind) problems.push(`${card.no}: unknown kind ${card.kind}`);
      kinds[kind ?? card.kind] = (kinds[kind ?? card.kind] ?? 0) + 1;
      for (const field of ['no', 'name', 'color', 'picture'] as const) if (!card[field]) problems.push(`${card.no}: no ${field}`);
      if (kind === 'CHARACTER') {
        for (const field of ['level', 'cost', 'power'] as const) if (!/^\d+$/.test(card[field])) problems.push(`${card.no}: unreadable ${field} "${card[field]}"`);
        // Soul is one icon per soul; "－" is a character printed without any soul icon (soul 0, e.g. STS/W140-008).
        if (!/^((\[\[soul\.gif\]\])+|[－-])$/.test(card.soul)) problems.push(`${card.no}: unreadable soul "${card.soul}"`);
        else if (!card.soul.includes('soul.gif')) noSoul.push(card.no);
      }

      const file = fileOf.get(fileStem(card.no));
      if (!file) {
        images.missing.push(card.no);
        continue;
      }
      used.add(file);
      images.present++;
      const entry = index[card.no];
      try {
        const buf = readFileSync(join(ART, file));
        checkImage(buf);
        if (!entry) throw new Error('not in image-index.json');
        if (entry.file !== file) throw new Error(`index names ${entry.file}`);
        if (entry.sha256 !== sha256(buf)) throw new Error('SHA-256 differs from the index');
        if (entry.url && !entry.url.endsWith(card.picture)) throw new Error(`recorded source is not this card's picture path (${card.picture})`);
        images.verified++;
      } catch (error) {
        images.problems.push(`${card.no}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (set.source.expansion !== undefined) {
      if (codes.size !== 1) problems.push(`${folder}: card numbers with several codes: ${[...codes].join(', ')}`);
      const base = (set.source.listedEntries ?? 0) - (set.source.parallelEntries ?? 0);
      if (base !== set.cards.length) problems.push(`${folder}: the official list had ${base} base cards, stored ${set.cards.length}`);
    }
    return { folder, product: set.source.product, released: set.source.released ?? null, cards: set.cards.length, officialListed: set.source.listedEntries ?? null, parallels: set.source.parallelEntries ?? null, codes: [...codes], kinds, images };
  });

const orphanFiles = files.filter((f) => !used.has(f));
const orphanIndex = Object.keys(index).filter((id) => !seen.has(id) || !existsSync(join(ART, index[id]!.file)));
const totals = {
  sets: sets.length,
  cards: sets.reduce((n, s) => n + s.cards, 0),
  imagesPresent: sets.reduce((n, s) => n + s.images.present, 0),
  imagesVerified: sets.reduce((n, s) => n + s.images.verified, 0),
  imagesMissing: sets.reduce((n, s) => n + s.images.missing.length, 0),
  imageProblems: sets.reduce((n, s) => n + s.images.problems.length, 0),
  orphanFiles,
  orphanIndex,
  charactersWithoutSoulIcon: noSoul,
};
writeFileSync(join(ROOT, 'reports/card_database_validation.json'), `${JSON.stringify({ checkedAt: new Date().toISOString(), totals, problems, sets }, null, 2)}\n`);
for (const s of sets) console.log(`${s.folder.padEnd(18)} cards ${String(s.cards).padStart(3)}  images ${s.images.verified}/${s.cards}${s.images.problems.length ? `  PROBLEMS ${s.images.problems.length}` : ''}`);
console.log(`total ${totals.cards} cards in ${totals.sets} sets; images verified ${totals.imagesVerified}, missing ${totals.imagesMissing}, with problems ${totals.imageProblems}; files without a card ${orphanFiles.length}; data problems ${problems.length}`);
for (const p of problems) console.error(`  ${p}`);
if (problems.length > 0 || totals.imageProblems > 0) process.exitCode = 1;
