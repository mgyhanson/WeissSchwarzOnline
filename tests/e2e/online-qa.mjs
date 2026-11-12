/**
 * STEP 9 acceptance: two real browsers (headless Chromium) play online
 * against each other through the game server.
 *
 *   npm run qa:online      (builds the client and the server first)
 *
 * The script starts its own server on a free port with a temporary
 * database. It checks:
 *  1. Alice (desktop) creates a room; Bob (phone size) opens the invite link
 *     and joins; both press ready; the game starts on both screens.
 *  2. Every message either browser receives keeps hidden information
 *     hidden (opponent's hand, both decks, both stocks; no seed).
 *  3. Bob reloads the page mid-game and is put straight back into it.
 *  4. Alice's browser goes offline for a while: her screen says so, the
 *     game waits, and she reconnects by herself when back online.
 *     (Chromium's offline mode blocks the page's messages but keeps the
 *     connection itself open, so the server cannot see this one; on a real
 *     network the heartbeat notices within 15 to 30 seconds.)
 *  4b. Alice closes her tab: Bob is told the game is held for her; she
 *     opens the site again and is back in the game.
 *  5. Both play to the end (自動代打) and see opposite results.
 *  6. The replay downloads, and the replay viewer plays it to the same result.
 *  7. Rematch; Bob then closes his browser for good: after the hold
 *     (GRACE_MINUTES, short here) the server concedes for him.
 * Screenshots go to QA_OUT (default data.nosync/qa-online).
 */

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const OUT = process.env.QA_OUT ?? 'data.nosync/qa-online';
mkdirSync(OUT, { recursive: true });
const GRACE_SECONDS = 25;

const problems = [];
const check = (ok, message) => {
  console.log(`${ok ? '✓' : '✗'} ${message}`);
  if (!ok) problems.push(message);
};

function freePort() {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function startServer(port, db) {
  const child = spawn(process.execPath, ['backend/dist.nosync/server.mjs'], {
    env: { ...process.env, PORT: String(port), DB: db, GRACE_MINUTES: String(GRACE_SECONDS / 60), HEARTBEAT_SECONDS: '2' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return { child, log: () => log };
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server did not start:\n${log}`);
}

/** Records hidden-information problems in every WebSocket message a page receives. */
function watchFrames(page, name, leaks) {
  page.on('websocket', (ws) => {
    ws.on('framereceived', ({ payload }) => {
      let m;
      try {
        m = JSON.parse(String(payload));
      } catch {
        return;
      }
      if (m.t === 'replay') return; // Only sent after the game, on request.
      if (String(payload).includes('"seed"')) leaks.push(`${name}: a message contains a seed`);
      const views = m.t === 'game' ? m.updates.map((u) => u.view) : m.t === 'update' ? [m.update.view] : [];
      for (const view of views) {
        const opponent = view.viewer === 0 ? 1 : 0;
        if (view.sides[opponent].hand.some((c) => !c.hidden)) leaks.push(`${name}: opponent hand visible`);
        for (const side of view.sides) {
          if (side.deck.some((c) => !c.hidden)) leaks.push(`${name}: deck visible`);
          if (side.stock.some((c) => !c.hidden)) leaks.push(`${name}: stock visible`);
        }
      }
    });
  });
}

async function setFastAutoPlay(page) {
  await page.locator('.speed-select select').selectOption('FAST');
  const box = page.locator('.toggle input');
  if (!(await box.isChecked())) await box.check();
}

const turnNumber = async (page) => Number(((await page.locator('.turn-owner').textContent().catch(() => '')) ?? '').match(/第 (\d+) 回合/)?.[1] ?? 0);

const port = await freePort();
const dir = mkdtempSync(join(tmpdir(), 'wso-online-qa-'));
const server = await startServer(port, join(dir, 'server.sqlite'));
const URL = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();
const leaks = [];
const errors = [];

try {
  const alice = await browser.newContext({ viewport: { width: 1366, height: 850 }, acceptDownloads: true });
  const bob = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  let a = await alice.newPage();
  const b = await bob.newPage();
  for (const [page, name] of [
    [a, 'Alice'],
    [b, 'Bob'],
  ]) {
    watchFrames(page, name, leaks);
    page.on('pageerror', (e) => errors.push(`${name}: ${String(e).slice(0, 160)}`));
  }

  // 1. Room, invite link, ready.
  await a.goto(URL);
  await a.getByRole('button', { name: '前往網上對戰' }).click();
  await a.getByLabel('你的名稱').fill('Alice');
  await a.getByLabel('你的卡組').selectOption('test-sao-memory');
  await a.getByRole('button', { name: '建立房間' }).click();
  const code = (await a.getByTestId('room-code').textContent()).trim();
  check(/^[A-Z2-9]{6}$/.test(code), `room created with code ${code}`);
  const invite = await a.locator('.invite-link').textContent();
  check(invite.endsWith(`/?room=${code}`), 'invite link shown');

  await b.goto(`${URL}/?room=${code}`);
  check((await b.getByLabel('房間代碼').inputValue()) === code, 'the invite link fills in the room code');
  await b.getByLabel('你的名稱').fill('Bob');
  await b.getByLabel('你的卡組').selectOption('test-gup');
  await b.getByRole('button', { name: '加入房間' }).click();
  await a.locator('.seat', { hasText: 'Bob' }).waitFor();
  check(true, 'Alice sees Bob join');
  await a.getByRole('button', { name: '準備', exact: true }).click();
  await b.getByRole('button', { name: '準備', exact: true }).click();
  await Promise.all([a.locator('.game').waitFor(), b.locator('.game').waitFor()]);
  check(true, 'the game starts on both screens');
  check((await a.locator('.player-bar').first().textContent()).includes('Bob'), 'Alice’s board names her opponent Bob');
  await a.screenshot({ path: `${OUT}/alice-start.png` });
  await b.screenshot({ path: `${OUT}/bob-start.png` });
  await setFastAutoPlay(a);
  await setFastAutoPlay(b);

  // 3. Bob reloads mid-game.
  await b.waitForFunction(() => /第 ([3-9]|\d\d) 回合/.test(document.querySelector('.turn-owner')?.textContent ?? ''), null, { timeout: 180_000 });
  const turnBefore = await turnNumber(b);
  await b.reload();
  await b.locator('.game').waitFor({ timeout: 20_000 });
  const turnAfter = await turnNumber(b);
  check(turnAfter >= turnBefore && turnAfter > 0, `after a reload Bob is back in the game (turn ${turnBefore} → ${turnAfter})`);
  await setFastAutoPlay(b);

  // 4. Alice goes offline, then comes back.
  await a.waitForFunction(() => /第 ([5-9]|\d\d) 回合/.test(document.querySelector('.turn-owner')?.textContent ?? ''), null, { timeout: 180_000 });
  await alice.setOffline(true);
  const noticed = await a.locator('.notice', { hasText: '連線中斷' }).waitFor({ timeout: 25_000 }).then(
    () => true,
    () => false,
  );
  check(noticed, 'offline: Alice’s screen says the connection is lost and the game is kept');
  await a.screenshot({ path: `${OUT}/alice-offline.png` });
  await alice.setOffline(false);
  const back = await a.locator('.notice', { hasText: '連線中斷' }).waitFor({ state: 'detached', timeout: 30_000 }).then(
    () => true,
    () => false,
  );
  check(back, 'back online: Alice reconnects by herself');
  await setFastAutoPlay(a);

  // 4b. Alice closes the tab, then comes back.
  const turnClosed = await turnNumber(a);
  await a.close();
  const bobSees = await b.locator('.notice', { hasText: '對手斷線' }).waitFor({ timeout: 20_000 }).then(
    () => true,
    () => false,
  );
  check(bobSees, 'Alice closed her tab: Bob is told the game is held for her and for how long');
  await b.screenshot({ path: `${OUT}/bob-waiting.png` });
  a = await alice.newPage();
  watchFrames(a, 'Alice', leaks);
  a.on('pageerror', (e) => errors.push(`Alice: ${String(e).slice(0, 160)}`));
  await a.goto(URL);
  await a.locator('.game').waitFor({ timeout: 20_000 });
  check((await turnNumber(a)) >= turnClosed, 'Alice opens the site again and is put straight back into the game');
  const cleared = await b.locator('.notice', { hasText: '對手斷線' }).waitFor({ state: 'detached', timeout: 20_000 }).then(
    () => true,
    () => false,
  );
  check(cleared, 'Bob’s notice goes away when Alice is back');
  await setFastAutoPlay(a);

  // 5. To the end.
  await Promise.all([a.locator('.result-text').waitFor({ timeout: 600_000 }), b.locator('.result-text').waitFor({ timeout: 600_000 })]);
  const [ra, rb] = [await a.locator('.result-text').textContent(), await b.locator('.result-text').textContent()];
  const opposite = (ra.startsWith('你勝出') && rb.startsWith('你落敗')) || (ra.startsWith('你落敗') && rb.startsWith('你勝出')) || (ra.startsWith('和局') && rb.startsWith('和局'));
  check(opposite, `both see the end: Alice “${ra}”, Bob “${rb}”`);
  await a.screenshot({ path: `${OUT}/alice-end.png` });
  await b.screenshot({ path: `${OUT}/bob-end.png` });

  // 6. Replay: download, then watch.
  const [download] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: '下載重播檔' }).click()]);
  const file = join(OUT, download.suggestedFilename());
  await download.saveAs(file);
  const replay = JSON.parse(readFileSync(file, 'utf8'));
  check(replay.format === 'wso-replay' && replay.entries.length > 50 && replay.players.join() === 'Alice,Bob', `replay file downloaded (${replay.entries.length} answers)`);
  await a.getByRole('button', { name: '觀看重播' }).click();
  await a.locator('.replay-controls').waitFor();
  await a.getByRole('button', { name: '跳到結尾' }).click();
  await a.locator('.result-text').waitFor({ timeout: 30_000 });
  check((await a.locator('.result-text').textContent()) === ra, 'the replay viewer reaches the same result');
  await a.screenshot({ path: `${OUT}/alice-replay.png` });
  await a.getByRole('button', { name: '離開重播' }).first().click();

  // 7. Rematch, then Bob leaves for good: the server concedes for him after the hold.
  await a.getByRole('button', { name: '再戰' }).click();
  await b.getByRole('button', { name: '再戰' }).click();
  await Promise.all([
    a.waitForFunction(() => document.querySelector('.game') !== null && !document.querySelector('.result-text'), null, { timeout: 30_000 }),
    b.waitForFunction(() => document.querySelector('.game') !== null && !document.querySelector('.result-text'), null, { timeout: 30_000 }),
  ]);
  check(true, 'rematch: a second game starts on both screens');
  await bob.close();
  const started = Date.now();
  await a.locator('.result-text').waitFor({ timeout: (GRACE_SECONDS + 30) * 1000 });
  const seconds = Math.round((Date.now() - started) / 1000);
  const forfeitText = await a.locator('.result-text').textContent();
  const forfeitNotice = await a.locator('.notice').textContent().catch(() => '');
  check(forfeitText.startsWith('你勝出') && forfeitNotice.includes('斷線超過保留時間'), `Bob stayed away: after ${seconds} s (hold ${GRACE_SECONDS} s) Alice wins by forfeit`);
  await a.screenshot({ path: `${OUT}/alice-forfeit.png` });
  await alice.close();
} catch (error) {
  problems.push(String(error).slice(0, 300));
  console.error(error);
} finally {
  await browser.close();
  server.child.kill();
  rmSync(dir, { recursive: true, force: true });
}

check(leaks.length === 0, `no hidden information in any message (${leaks.slice(0, 3).join('; ')})`);
check(errors.length === 0, `no page errors (${errors.slice(0, 3).join('; ')})`);
if (problems.length > 0) {
  console.error(`\nOnline QA failed:\n- ${problems.join('\n- ')}`);
  if (server.log().trim()) console.error(`\nServer log:\n${server.log()}`);
  process.exit(1);
}
console.log(`\nOnline QA passed. Screenshots in ${OUT}/`);
