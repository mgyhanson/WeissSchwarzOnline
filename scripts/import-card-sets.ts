/**
 * Imports whole booster packs from the official card list (ws-tcg.com).
 *
 *   node scripts/import-card-sets.ts                 every set in card-database/import/sets.json
 *   node scripts/import-card-sets.ts --sets=STS_W140 only these folders
 *   node scripts/import-card-sets.ts --no-images     card data only
 *   node scripts/import-card-sets.ts --refresh       fetch again even what is cached
 *
 * Safe to run again: every raw response is cached in data.nosync/import-cache
 * (kept as published), cards are keyed by card number (no duplicates), and an
 * image that already exists is never overwritten. At most one request every
 * 1.1 seconds; robots.txt of ws-tcg.com allows these paths.
 *
 * Writes:
 *  - card-database/sets/<folder>/official.json   the base cards (parallel
 *    variants share the base card's text and are counted, not stored)
 *  - card-assets/local.nosync/<card>.png          official card images, used
 *    with the owner's stated permission; local only (git-ignored, not synced
 *    by iCloud, not in builds, never sent to online opponents)
 *  - card-assets/local.nosync/image-index.json    SHA-256, size and source
 *  - reports/card_import_report.json and .md
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkImage, fileStem, sha256 } from './images-lib.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'data.nosync/import-cache');
const ART = join(ROOT, 'card-assets/local.nosync');
const UA = 'WSOnlineCommunitySimulator/0.1 (personal, non-commercial project)';
const SITE = 'https://ws-tcg.com';
const IMAGE_BASE = `${SITE}/wordpress/wp-content/images/cardlist/`;
const today = new Date().toISOString().slice(0, 10);

/** Trigger icon images whose meaning has been verified (card-database/src/official.ts). */
const KNOWN_ICONS = new Set(['soul.gif', 'salvage.gif', 'bounce.gif', 'shot.gif', 'draw.gif', 'treasure.gif', 'choice.gif', 'gate.gif', 'standby.gif']);

interface SetConfig {
  folder: string;
  code: string;
  expansion: number;
  product: string;
  released: string;
  productUrl: string;
}

interface OfficialCard {
  no: string;
  name: string;
  kana: string;
  kind: string;
  color: string;
  level: string;
  cost: string;
  power: string;
  soul: string;
  trigger: string;
  traits: string[];
  text: string;
  flavor: string;
  rare: string;
  picture: string;
  update_time: string;
  expansion: string;
  side: string;
  faqs: { date: string; q: string; a: string }[];
}

interface ImageEntry {
  file: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  format: 'png' | 'jpeg';
  source: 'official-cardlist' | 'user-zip';
  url: string | null;
  recordedOn: string;
  status: 'VERIFIED';
}

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--sets='))?.slice(7).split(',');
const withImages = !args.includes('--no-images');
const refresh = args.includes('--refresh');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let lastRequest = 0;
let requests = 0;

/** GET with the rate limit and three attempts. */
async function get(url: string): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequest + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    requests++;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (error) {
      if (attempt >= 3) throw new Error(`${url}: ${String(error)}`);
      await sleep(3000 * attempt);
    }
  }
}

async function cachedJson(file: string, url: string): Promise<unknown> {
  if (!refresh && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const body = await get(url);
  const data = JSON.parse(body.toString('utf8'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
  return data;
}

const safeName = (cardId: string) => cardId.replace(/[^A-Za-z0-9-]/g, '_');

function toOfficial(c: Record<string, any>): OfficialCard {
  return {
    no: c.card_number,
    name: c.card_name,
    kana: c.card_name_kana,
    kind: c.card_kind,
    color: c.color,
    level: c.level,
    cost: c.cost,
    power: c.power,
    soul: c.soul,
    trigger: c.card_trigger,
    traits: [c.feature1, c.feature2, c.feature3],
    text: c.text,
    flavor: c.flavor,
    rare: c.rare,
    picture: c.picture,
    update_time: c.update_time,
    expansion: c.expansion_rel?.name ?? '',
    side: c.side,
    faqs: (c.faqs ?? []).map((f: Record<string, string>) => ({ date: f.date, q: f.question, a: f.answer })),
  };
}

function loadIndex(): Record<string, ImageEntry> {
  const file = join(ART, 'image-index.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, ImageEntry>) : {};
}

function existingImage(cardId: string): string | null {
  if (!existsSync(ART)) return null;
  const stem = fileStem(cardId);
  return readdirSync(ART).find((f) => f.replace(/\.[^.]+$/, '') === stem) ?? null;
}

interface SetReport {
  folder: string;
  code: string;
  product: string;
  released: string;
  expansion: number;
  listedEntries: number;
  baseCards: number;
  parallelEntries: number;
  stored: number;
  missingData: string[];
  kinds: Record<string, number>;
  unverifiedTriggerIcons: Record<string, string[]>;
  changedSinceLastImport: string[];
  images: { verified: number; downloaded: number; alreadyPresent: number; failed: { card: string; reason: string }[]; missing: string[] };
}

async function importSet(set: SetConfig, index: Record<string, ImageEntry>): Promise<SetReport> {
  const dir = join(CACHE, String(set.expansion));
  const first = (await cachedJson(join(dir, 'list-1.json'), `${SITE}/manage/CardListUser/searchJson?expansion=${set.expansion}&page=1`)) as { total: number; page_count: number; items: Record<string, any>[] };
  const items = [...first.items];
  for (let page = 2; page <= first.page_count; page++) {
    const next = (await cachedJson(join(dir, `list-${page}.json`), `${SITE}/manage/CardListUser/searchJson?expansion=${set.expansion}&page=${page}`)) as { items: Record<string, any>[] };
    items.push(...next.items);
  }
  const unique = new Map(items.map((it) => [it.card_number as string, it]));
  if (unique.size !== first.total) throw new Error(`${set.folder}: listed ${first.total}, received ${unique.size}`);
  const base = [...unique.values()].filter((it) => !it.parallel_param);
  const parallels = [...unique.values()].filter((it) => it.parallel_param);
  const wrongCode = base.filter((it) => !String(it.card_number).startsWith(`${set.code}-`)).map((it) => it.card_number);
  if (wrongCode.length > 0) console.warn(`${set.folder}: cards with another code: ${wrongCode.join(', ')}`);

  const report: SetReport = {
    folder: set.folder,
    code: set.code,
    product: set.product,
    released: set.released,
    expansion: set.expansion,
    listedEntries: unique.size,
    baseCards: base.length,
    parallelEntries: parallels.length,
    stored: 0,
    missingData: [],
    kinds: {},
    unverifiedTriggerIcons: {},
    changedSinceLastImport: [],
    images: { verified: 0, downloaded: 0, alreadyPresent: 0, failed: [], missing: [] },
  };

  const cards: OfficialCard[] = [];
  for (const [i, it] of base.entries()) {
    const no = it.card_number as string;
    try {
      const detail = (await cachedJson(join(dir, 'detail', `${safeName(no)}.json`), `${SITE}/manage/CardListUser/detailByNoJson?card_number=${encodeURIComponent(no)}`)) as { card: Record<string, any> };
      const card = toOfficial(detail.card);
      if (card.no !== no) throw new Error(`asked for ${no}, got ${card.no}`);
      cards.push(card);
      const kind = { '2': 'CHARACTER', '3': 'EVENT', '4': 'CLIMAX' }[card.kind] ?? `kind ${card.kind}`;
      report.kinds[kind] = (report.kinds[kind] ?? 0) + 1;
      for (const icon of card.trigger.matchAll(/\[\[([^\]]+)\]\]/g)) {
        if (!KNOWN_ICONS.has(icon[1]!)) (report.unverifiedTriggerIcons[icon[1]!] ??= []).push(no);
      }
    } catch (error) {
      report.missingData.push(`${no}: ${String(error)}`);
    }
    if ((i + 1) % 25 === 0) console.log(`  ${set.folder}: ${i + 1}/${base.length} cards`);
  }
  cards.sort((a, b) => a.no.localeCompare(b.no));
  report.stored = cards.length;

  // official.json: compare with what was stored before, then write.
  const setDir = join(ROOT, 'card-database/sets', set.folder);
  const officialFile = join(setDir, 'official.json');
  if (existsSync(officialFile)) {
    const before = JSON.parse(readFileSync(officialFile, 'utf8')) as { cards: OfficialCard[] };
    const now = new Map(cards.map((c) => [c.no, JSON.stringify(c)]));
    for (const old of before.cards) {
      const fresh = now.get(old.no);
      if (fresh === undefined) report.missingData.push(`${old.no}: stored before but not in the official list now`);
      else if (fresh !== JSON.stringify(old)) report.changedSinceLastImport.push(old.no);
    }
  }
  mkdirSync(setDir, { recursive: true });
  const official = {
    source: {
      site: `${SITE}/cardlist/`,
      endpoint: `${SITE}/manage/CardListUser/detailByNoJson?card_number=<card number>`,
      product: set.product,
      fetchedOn: today,
      method: `Read from the official card list (expansion ${set.expansion}) by scripts/import-card-sets.ts, at most one request every 1.1 seconds. Every base card of the booster (${base.length}); the ${parallels.length} parallel variants share their base card's text and are not stored separately. Only the fields below were kept, as published. Raw responses are cached in data.nosync/import-cache/${set.expansion}.`,
      sha256OfCompactCards: sha256(JSON.stringify(cards)),
      copyright: 'Card names, text and data © Bushiroad and the respective rights holders. Stored for private, non-commercial reference only.',
      expansion: set.expansion,
      released: set.released,
      productUrl: set.productUrl,
      listedEntries: unique.size,
      parallelEntries: parallels.length,
    },
    cards,
  };
  writeFileSync(officialFile, `${JSON.stringify(official, null, 2)}\n`);

  if (withImages) {
    mkdirSync(ART, { recursive: true });
    for (const [i, card] of cards.entries()) {
      try {
        const present = existingImage(card.no);
        if (present) {
          // Never overwritten; verified and indexed if not yet.
          const buf = readFileSync(join(ART, present));
          const info = checkImage(buf);
          const known = index[card.no];
          index[card.no] = known && known.sha256 === sha256(buf) ? known : { file: present, sha256: sha256(buf), bytes: buf.length, ...info, source: 'official-cardlist', url: `${IMAGE_BASE}${card.picture}`, recordedOn: today, status: 'VERIFIED' };
          report.images.alreadyPresent++;
          report.images.verified++;
          continue;
        }
        if (!card.picture) {
          report.images.missing.push(card.no);
          continue;
        }
        const url = `${IMAGE_BASE}${card.picture}`;
        const buf = await get(url);
        const info = checkImage(buf);
        const file = `${fileStem(card.no)}.${info.format === 'png' ? 'png' : 'jpg'}`;
        writeFileSync(join(ART, file), buf);
        index[card.no] = { file, sha256: sha256(buf), bytes: buf.length, ...info, source: 'official-cardlist', url, recordedOn: today, status: 'VERIFIED' };
        report.images.downloaded++;
        report.images.verified++;
      } catch (error) {
        report.images.failed.push({ card: card.no, reason: String(error).slice(0, 200) });
      }
      if ((i + 1) % 25 === 0) {
        console.log(`  ${set.folder}: ${i + 1}/${cards.length} images`);
        writeFileSync(join(ART, 'image-index.json'), `${JSON.stringify(index, null, 2)}\n`);
      }
    }
  }
  return report;
}

function writeSources(index: Record<string, ImageEntry>): void {
  // sources.json is what the client shows as the image source (card-assets/README.md).
  const file = join(ART, 'sources.json');
  const sources = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : {};
  for (const entry of Object.values(index)) {
    sources[entry.file] ??= {
      source: entry.source === 'user-zip' ? '官方卡表圖片（使用者提供的 102 張整合包）' : '官方卡表圖片（ws-tcg.com）',
      licence: '使用者表示已取得使用許可；只在本機使用',
      note: entry.url ?? '',
    };
  }
  writeFileSync(file, `${JSON.stringify(sources, null, 2)}\n`);
}

function markdown(reports: SetReport[], startedAt: string): string {
  const lines = [
    '# 卡牌匯入報告',
    '',
    `由 \`scripts/import-card-sets.ts\` 產生。開始時間 ${startedAt}，共 ${requests} 個網絡請求（其餘來自快取）。`,
    '',
    '| 系列 | 代碼 | 發售日 | 官方列出（含異圖） | 基本卡 | 異圖 | 已儲存 | 缺少資料 | 卡圖已核對 | 卡圖失敗 | 未核實的 Trigger 圖示 |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...reports.map(
      (r) =>
        `| ${r.product} | ${r.code} | ${r.released} | ${r.listedEntries} | ${r.baseCards} | ${r.parallelEntries} | ${r.stored} | ${r.missingData.length} | ${r.images.verified} | ${r.images.failed.length} | ${Object.keys(r.unverifiedTriggerIcons).join('、') || '—'} |`,
    ),
    '',
  ];
  for (const r of reports) {
    lines.push(`## ${r.product}（${r.code}）`, '');
    lines.push(`- 種類：${Object.entries(r.kinds).map(([k, n]) => `${k} ${n}`).join('、')}`);
    if (r.missingData.length) lines.push(`- 缺少資料：${r.missingData.join('；')}`);
    if (r.changedSinceLastImport.length) lines.push(`- 與上次匯入不同（官方資料已更新）：${r.changedSinceLastImport.join('、')}`);
    for (const [icon, cards] of Object.entries(r.unverifiedTriggerIcons)) lines.push(`- 未核實的 Trigger 圖示 ${icon}：${cards.join('、')}`);
    lines.push(`- 卡圖：下載 ${r.images.downloaded}、原有 ${r.images.alreadyPresent}、失敗 ${r.images.failed.length}、官方沒有圖片路徑 ${r.images.missing.length}`);
    for (const f of r.images.failed) lines.push(`  - ${f.card}：${f.reason}`);
    lines.push('');
  }
  return lines.join('\n');
}

const config = JSON.parse(readFileSync(join(ROOT, 'card-database/import/sets.json'), 'utf8')) as { sets: SetConfig[] };
const sets = config.sets.filter((s) => !only || only.includes(s.folder));
const startedAt = new Date().toISOString();
const index = loadIndex();
const reports: SetReport[] = [];
for (const set of sets) {
  console.log(`${set.folder} (${set.product})`);
  reports.push(await importSet(set, index));
  if (withImages) {
    writeFileSync(join(ART, 'image-index.json'), `${JSON.stringify(index, null, 2)}\n`);
    writeSources(index);
  }
}
mkdirSync(join(ROOT, 'reports'), { recursive: true });
// The report keeps the results of sets not imported in this run.
const reportFile = join(ROOT, 'reports/card_import_report.json');
const previous = existsSync(reportFile) ? (JSON.parse(readFileSync(reportFile, 'utf8')) as { sets: SetReport[] }).sets : [];
const merged = [...previous.filter((p) => !reports.some((r) => r.folder === p.folder)), ...reports].sort((a, b) => b.released.localeCompare(a.released));
writeFileSync(reportFile, `${JSON.stringify({ generatedAt: startedAt, sets: merged }, null, 2)}\n`);
writeFileSync(join(ROOT, 'reports/card_import_report.md'), `${markdown(merged, startedAt)}\n`);
console.log(`Done: ${requests} requests. Report in reports/card_import_report.md`);
