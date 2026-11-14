/**
 * Card picture checks shared by the browser QA scripts (ui-qa, online-qa).
 *
 * "Shown" always means a real <img> served from /user-art/ that finished
 * loading with a non-zero size: not the drawn fallback face behind it.
 */

/** Where on the screen a loaded picture counts for which area. */
const AREAS = {
  hand: '.hand .card:not(.card-back)',
  stage: '.side .slot .card:not(.card-back)',
  climax: '.side .zone-cx .card',
  reveal: '.reveal .card',
  flying: '.flyer .card',
  waitingRoom: '.side .pile .card:not(.card-back)',
};

/**
 * Starts watching a page: every /user-art/ request with its status, and
 * which areas of the battle screen have shown a loaded picture. Survives
 * reloads. Returns the record, filled in as the page runs.
 */
export async function watchPictures(page) {
  const record = { requests: new Map(), seen: new Set(), landscapeClimax: false, backWithPicture: false };
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/user-art/') || url.pathname.endsWith('/manifest.json')) return;
    record.requests.set(decodeURIComponent(url.pathname.slice('/user-art/'.length)), response.status());
  });
  await page.exposeBinding('__pictureSeen', (_source, what) => {
    if (what === 'landscapeClimax') record.landscapeClimax = true;
    else if (what === 'backWithPicture') record.backWithPicture = true;
    else record.seen.add(what);
  });
  await page.addInitScript((areas) => {
    const told = new Set();
    const tell = (what) => {
      if (told.has(what)) return;
      told.add(what);
      window.__pictureSeen(what);
    };
    const loaded = (img) => img.complete && img.naturalWidth > 0 && img.getAttribute('src')?.startsWith('/user-art/');
    setInterval(() => {
      for (const [area, selector] of Object.entries(areas)) {
        if (told.has(area)) continue;
        if ([...document.querySelectorAll(`${selector} img.c-img`)].some(loaded)) tell(area);
      }
      // A climax picture is landscape and is turned to stand like the card.
      if ([...document.querySelectorAll('.zone-cx img.c-img.is-landscape, .hand img.c-img.is-landscape')].some(loaded)) tell('landscapeClimax');
      // The back of a card never carries a picture.
      if (document.querySelector('.card-back img')) tell('backWithPicture');
    }, 100);
  }, AREAS);
  return record;
}

/** Card id of a picture file name (SY_W08-T06.png → SY/W08-T06). */
export const cardIdOfFile = (file) => file.replace(/\.[^.]+$/, '').replace('_', '/');

/** Loaded and missing pictures among the cards currently matching `selector`. */
export async function picturesIn(page, selector) {
  return page.evaluate(async (sel) => {
    const cards = [...document.querySelectorAll(sel)].filter((c) => !c.classList.contains('card-back'));
    for (const card of cards) card.scrollIntoView({ block: 'center' });
    // Lazy pictures start loading once scrolled to; give them a moment.
    const deadline = Date.now() + 8000;
    // is-loaded is set by the page once it has measured the picture (and decided upright or landscape).
    const ok = (img) => img && img.complete && img.naturalWidth > 0 && img.classList.contains('is-loaded') && img.getAttribute('src')?.startsWith('/user-art/');
    while (Date.now() < deadline && !cards.every((c) => ok(c.querySelector('img.c-img')))) {
      for (const card of cards) if (!ok(card.querySelector('img.c-img'))) card.scrollIntoView({ block: 'center' });
      await new Promise((r) => setTimeout(r, 100));
    }
    const imgs = cards.map((c) => c.querySelector('img.c-img'));
    return {
      cards: cards.length,
      shown: imgs.filter(ok).length,
      landscape: imgs.filter((img) => ok(img) && img.classList.contains('is-landscape')).length,
      upright: imgs.filter((img) => ok(img) && img.classList.contains('is-full') && !img.classList.contains('is-landscape')).length,
    };
  }, selector);
}

/**
 * The card browser and the deck builder show real pictures; a picture that
 * fails to load falls back to the drawn face. `check(ok, message)` records
 * each result. The page must be on the site already.
 */
export async function checkBrowserAndBuilder(page, check, label) {
  const manifest = await page.evaluate(() => fetch('/user-art/manifest.json').then((r) => r.json()));
  const files = Object.keys(manifest.files ?? {}).length;
  check(files > 0, `${label}: the picture list loads (${files} cards have a picture)`);

  // Card browser: the first page of cards, then climaxes only.
  await page.getByRole('button', { name: '卡牌', exact: true }).click();
  await page.locator('.card-grid-browser .card').first().waitFor();
  const all = await picturesIn(page, '.card-grid-browser .card');
  check(all.cards > 0 && all.shown === all.cards, `${label}: card browser shows a real picture on every card (${all.shown}/${all.cards})`);
  await page.locator('.filter', { hasText: '種類' }).locator('select').selectOption('CLIMAX');
  await page.locator('.card-grid-browser .card').first().waitFor();
  const climaxes = await picturesIn(page, '.card-grid-browser .card');
  check(climaxes.cards > 0 && climaxes.landscape === climaxes.cards, `${label}: climax pictures are landscape and turned to fit (${climaxes.landscape}/${climaxes.cards})`);
  await page.locator('.filter', { hasText: '種類' }).locator('select').selectOption('CHARACTER');
  await page.locator('.card-grid-browser .card').first().waitFor();
  const characters = await picturesIn(page, '.card-grid-browser .card');
  check(characters.cards > 0 && characters.upright === characters.cards, `${label}: character pictures are shown whole and upright (${characters.upright}/${characters.cards})`);

  // Card details: the large card.
  await page.locator('.card-grid-browser .card').first().click();
  const large = await picturesIn(page, '.card-large');
  check(large.cards >= 1 && large.shown === large.cards, `${label}: the card details sheet shows the large picture`);
  await page.keyboard.press('Escape');

  // A picture that cannot be loaded: the drawn face stays, the broken image is removed (cards of a set the deck builder check below does not use).
  await page.locator('.filter', { hasText: '種類' }).locator('select').selectOption('');
  await page.route('**/user-art/ANM_W138-00*', (route) => route.abort());
  await page.locator('.search').first().fill('ANM/W138-00');
  await page.locator('.card-grid-browser .card').first().waitFor();
  const fallback = await page
    .waitForFunction(
      () => {
        const cards = [...document.querySelectorAll('.card-grid-browser .card')];
        for (const card of cards) card.scrollIntoView({ block: 'center' });
        return cards.length > 0 && cards.every((c) => !c.querySelector('img.c-img') && c.querySelector('.c-art svg.card-art'));
      },
      null,
      { timeout: 15_000 },
    )
    .then(
      () => true,
      () => false,
    );
  check(fallback, `${label}: a picture that fails to load is replaced by the drawn card face`);
  await page.unroute('**/user-art/ANM_W138-00*');
  await page.locator('.search').first().fill('');

  // Deck builder: the card pool and the deck's own list.
  await page.getByRole('button', { name: '卡組', exact: true }).click();
  await page.locator('.deck-item', { hasText: 'BanG Dream' }).getByRole('button', { name: '複製並編輯' }).click();
  await page.locator('.deck-editor').waitFor();
  const visible = async (selector) => (await page.locator(selector).first().isVisible().catch(() => false));
  if (!(await visible('.deck-card-grid .card'))) await page.locator('.deck-tabs [role="tab"]').first().click();
  await page.locator('.deck-card-grid .card').first().waitFor();
  const pool = await picturesIn(page, '.deck-card-grid .card');
  check(pool.cards > 0 && pool.shown === pool.cards, `${label}: deck builder card pool shows real pictures (${pool.shown}/${pool.cards})`);
  if (!(await visible('.deck-rows .card'))) await page.locator('.deck-tabs [role="tab"]').nth(1).click();
  await page.locator('.deck-rows .card').first().waitFor();
  const rows = await picturesIn(page, '.deck-rows .card');
  check(rows.cards === 18 && rows.shown === rows.cards, `${label}: deck builder list shows a real picture for each of the BDY deck’s 18 cards (${rows.shown}/${rows.cards})`);
}
