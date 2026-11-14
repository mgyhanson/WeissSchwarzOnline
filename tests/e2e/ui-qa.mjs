/**
 * Browser QA of the battle interface with real headless Chromium.
 *
 *   npm run dev            (in another terminal)
 *   npm run qa:ui
 *
 * For desktop, phone portrait and phone landscape: starts a game, turns on
 * auto-play with animations at normal speed, and measures frame timing
 * while cards move; checks for horizontal scrolling and console errors;
 * saves a screenshot. Then checks the card pictures (tests/e2e/pictures.mjs):
 * card browser, card details and deck builder on desktop and phone show a
 * real picture on every card, climaxes landscape, and a picture that fails
 * to load falls back to the drawn face. Then plays one whole game to the
 * end (by default the BDY deck against the first test deck) and checks that
 * real pictures appeared in the hand, on the stage, in the climax zone, in
 * the reveal panel, on moving cards and on the waiting room pile.
 * Screenshots go to QA_OUT (default data.nosync/qa, which iCloud does not
 * sync and Git ignores). QA_DECKS picks the two test decks by id, e.g.
 * QA_DECKS=test-sao-memory,test-sao (default for the measurements: the
 * first two). Exits with an error when a check fails.
 */

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { checkBrowserAndBuilder, watchPictures } from './pictures.mjs';

const URL = process.env.QA_URL ?? 'http://localhost:5173';
const OUT = process.env.QA_OUT ?? 'data.nosync/qa';
const SECONDS = Number(process.env.QA_SECONDS ?? 15);
const DECKS = process.env.QA_DECKS ? process.env.QA_DECKS.split(',') : null;
mkdirSync(OUT, { recursive: true });

const SIZES = [
  { name: 'desktop', width: 1366, height: 850, mobile: false },
  { name: 'phone-portrait', width: 375, height: 812, mobile: true },
  { name: 'phone-landscape', width: 812, height: 375, mobile: true },
];

async function startGame(page, speed, decks = DECKS) {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL);
  if (decks) {
    await page.getByRole('combobox').nth(0).selectOption(decks[0]);
    await page.getByRole('combobox').nth(1).selectOption(decks[1]);
  }
  await page.getByRole('button', { name: '開始新對局' }).click();
  await page.locator('.speed-select select').selectOption(speed);
  await page.locator('.bar-buttons .toggle input').check();
}

/** Frame intervals measured with requestAnimationFrame while the game plays itself. */
async function measureFrames(page, seconds) {
  return page.evaluate(async (ms) => {
    const gaps = [];
    let flyers = 0;
    let last = performance.now();
    const end = last + ms;
    await new Promise((resolve) => {
      const tick = (now) => {
        gaps.push(now - last);
        last = now;
        flyers = Math.max(flyers, document.querySelectorAll('.flyer').length);
        if (now < end) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    gaps.sort((a, b) => a - b);
    const q = (p) => Math.round(gaps[Math.floor(p * (gaps.length - 1))] * 10) / 10;
    return { frames: gaps.length, fps: Math.round(gaps.length / (ms / 1000)), medianMs: q(0.5), p95Ms: q(0.95), over50Ms: gaps.filter((g) => g > 50).length, maxFlyers: flyers };
  }, seconds * 1000);
}

const problems = [];
const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    await startGame(page, 'NORMAL');
    const frames = await measureFrames(page, SECONDS);
    const layout = await page.evaluate(() => ({
      horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      cardWidth: Math.round(document.querySelector('.slot')?.getBoundingClientRect().width ?? 0),
      turn: document.querySelector('.turn-owner')?.textContent ?? '',
    }));
    await page.screenshot({ path: `${OUT}/${size.name}.png` });
    console.log(JSON.stringify({ size: size.name, ...frames, ...layout, errors: errors.length }));
    if (layout.horizontalScroll) problems.push(`${size.name}: horizontal scroll`);
    if (errors.length > 0) problems.push(`${size.name}: console errors: ${errors.slice(0, 3).join(' | ')}`);
    if (frames.maxFlyers === 0) problems.push(`${size.name}: no card moved during the measurement`);
    await context.close();
  }

  // Card pictures in the card browser and the deck builder, desktop and phone.
  const check = (ok, message) => {
    console.log(`${ok ? '✓' : '✗'} ${message}`);
    if (!ok) problems.push(message);
  };
  for (const size of [SIZES[0], SIZES[1]]) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile });
    const page = await context.newPage();
    await page.goto(URL);
    await checkBrowserAndBuilder(page, check, size.name);
    await page.screenshot({ path: `${OUT}/pictures-${size.name}.png` });
    await context.close();
  }

  // A whole game to the end, animations fast; by default the BDY deck against the first test deck.
  const context = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  const pictures = await watchPictures(page);
  await startGame(page, 'FAST', DECKS ?? ['test-bdy', 'test-haruhi']);
  const started = Date.now();
  await page.locator('.result-text').waitFor({ timeout: 10 * 60 * 1000 });
  const result = await page.locator('.result-text').textContent();
  await page.screenshot({ path: `${OUT}/game-over.png` });
  console.log(JSON.stringify({ wholeGame: result, seconds: Math.round((Date.now() - started) / 1000), errors: errors.length }));
  if (errors.length > 0) problems.push(`whole game: errors: ${errors.slice(0, 3).join(' | ')}`);
  // Real pictures in every part of the battle screen during that game.
  for (const area of ['hand', 'stage', 'climax', 'reveal', 'flying', 'waitingRoom']) check(pictures.seen.has(area), `battle: real card pictures shown in: ${area}`);
  check(pictures.landscapeClimax, 'battle: a climax picture was shown landscape, turned to fit');
  check(!pictures.backWithPicture, 'battle: the back of a card never carries a picture');
  const failed = [...pictures.requests].filter(([, status]) => status !== 200 && status !== 304);
  check(pictures.requests.size > 20 && failed.length === 0, `battle: ${pictures.requests.size} pictures requested, none failed (${failed.slice(0, 3).join('; ')})`);
  await context.close();
} finally {
  await browser.close();
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`UI QA passed. Screenshots in ${OUT}/`);
