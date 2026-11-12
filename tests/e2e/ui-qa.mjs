/**
 * Browser QA of the battle interface with real headless Chromium.
 *
 *   npm run dev            (in another terminal)
 *   npm run qa:ui
 *
 * For desktop, phone portrait and phone landscape: starts a game, turns on
 * auto-play with animations at normal speed, and measures frame timing
 * while cards move; checks for horizontal scrolling and console errors;
 * saves a screenshot. Then plays one whole game to the end. Screenshots go
 * to QA_OUT (default data.nosync/qa, which iCloud does not sync and Git
 * ignores). Exits with an error when a check fails.
 */

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.QA_URL ?? 'http://localhost:5173';
const OUT = process.env.QA_OUT ?? 'data.nosync/qa';
const SECONDS = Number(process.env.QA_SECONDS ?? 15);
mkdirSync(OUT, { recursive: true });

const SIZES = [
  { name: 'desktop', width: 1366, height: 850, mobile: false },
  { name: 'phone-portrait', width: 375, height: 812, mobile: true },
  { name: 'phone-landscape', width: 812, height: 375, mobile: true },
];

async function startGame(page, speed) {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL);
  await page.getByRole('button', { name: '開始新對局' }).click();
  await page.locator('.speed-select select').selectOption(speed);
  await page.locator('.toggle input').check();
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

  // A whole game to the end, animations fast.
  const context = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await startGame(page, 'FAST');
  const started = Date.now();
  await page.locator('.result-text').waitFor({ timeout: 10 * 60 * 1000 });
  const result = await page.locator('.result-text').textContent();
  await page.screenshot({ path: `${OUT}/game-over.png` });
  console.log(JSON.stringify({ wholeGame: result, seconds: Math.round((Date.now() - started) / 1000), errors: errors.length }));
  if (errors.length > 0) problems.push(`whole game: errors: ${errors.slice(0, 3).join(' | ')}`);
  await context.close();
} finally {
  await browser.close();
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`UI QA passed. Screenshots in ${OUT}/`);
