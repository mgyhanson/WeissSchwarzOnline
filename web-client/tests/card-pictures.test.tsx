/**
 * Real card pictures, from the picture service to the card on screen:
 * the client loads the service's list, maps every card of the database to
 * its picture by card id, and draws an <img> for it; a card whose identity
 * the player does not know (drawn as a back) never gets one.
 *
 * The pictures are not in Git. Where the folder is absent (a fresh clone),
 * the tests that need the real files are skipped; the others still run.
 * The browser QA scripts (tests/e2e) check the same on real screens.
 */

import { existsSync, readFileSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allCards } from '@wso/card-database';
import { type UserArtMode, createUserArt } from '../../backend/src/user-art';
import { CardFace } from '../src/components/CardFace';
import { catalog, fileStemOf, loadUserImages } from '../src/images/providers';

const root = fileURLToPath(new URL('../../', import.meta.url));
const folder = `${root}card-assets/local.nosync`;
const hasPictures = existsSync(`${folder}/image-index.json`);

/** A picture service on a free local port, and a fetch that reaches it the way the page's relative URLs would. */
async function serve(dir: string | null, mode: UserArtMode): Promise<{ server: Server; fetcher: typeof fetch; base: string }> {
  const art = createUserArt(dir, mode);
  const server = createServer((req, res) => {
    if (!art.handle(req, res)) res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => fetch(`${base}${String(input)}`, init)) as typeof fetch;
  return { server, fetcher, base };
}

const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

describe('without pictures the game draws its own card faces', () => {
  it('a server with pictures switched off gives an empty list: no <img>, the drawn face only', async () => {
    const { server, fetcher } = await serve(hasPictures ? folder : null, 'off');
    try {
      await loadUserImages(fetcher);
      expect(catalog.imageFor('BDY/W135-006')).toBeNull();
      const html = renderToStaticMarkup(<CardFace cardId="BDY/W135-006" />);
      expect(html).toContain('class="card-art"');
      expect(html).not.toContain('<img');
    } finally {
      await close(server);
    }
  });

  it('no server at all (the list cannot be fetched) is not an error', async () => {
    await expect(loadUserImages((() => Promise.reject(new Error('offline'))) as typeof fetch)).resolves.toBeUndefined();
  });
});

describe.skipIf(!hasPictures)('the 609 real pictures', () => {
  let server: Server;
  let base: string;
  const index = hasPictures ? (JSON.parse(readFileSync(`${folder}/image-index.json`, 'utf8')) as Record<string, { file: string; bytes: number; sha256: string }>) : {};

  beforeAll(async () => {
    const started = await serve(folder, 'clients');
    server = started.server;
    base = started.base;
    await loadUserImages(started.fetcher);
  });
  afterAll(() => close(server));

  it('the list loads and maps every card of the database to its own picture, by card id', () => {
    const cards = allCards().map((card) => card.record.cardId);
    expect(cards).toHaveLength(609);
    for (const cardId of cards) {
      const image = catalog.imageFor(cardId);
      expect(image, cardId).toMatchObject({ source: 'USER' });
      // The file is the one the index lists for this card, and it carries the card's number.
      expect(image!.url, cardId).toBe(`/user-art/${encodeURIComponent(index[cardId]!.file)}`);
      expect(index[cardId]!.file.replace(/\.[^.]+$/, ''), cardId).toBe(fileStemOf(cardId));
    }
    // No two cards share a picture.
    expect(new Set(cards.map((cardId) => catalog.imageFor(cardId)!.url)).size).toBe(609);
  });

  it('every one of those picture addresses answers with the image the index describes', async () => {
    for (const card of allCards()) {
      const cardId = card.record.cardId;
      const response = await fetch(`${base}${catalog.imageFor(cardId)!.url}`, { method: 'HEAD' });
      expect(response.status, cardId).toBe(200);
      expect(response.headers.get('content-type'), cardId).toMatch(/^image\/(png|jpeg|webp)$/);
      expect(Number(response.headers.get('content-length')), cardId).toBe(index[cardId]!.bytes);
      expect(response.headers.get('etag'), cardId).toBe(`"${index[cardId]!.sha256.slice(0, 32)}"`);
    }
  });

  it('a card face is drawn with the real picture as an <img>, in every size, over the drawn face it falls back to', () => {
    for (const cardId of ['BDY/W135-006', 'BDY/W135-026', 'GUP/W141-001', 'SAO/S20-001', '5HY/W83-T01']) {
      for (const size of ['small', 'normal', 'large'] as const) {
        const html = renderToStaticMarkup(<CardFace cardId={cardId} size={size} />);
        expect(html, `${cardId} ${size}`).toContain(`<img class="c-img `);
        expect(html).toContain(`src="/user-art/${fileStemOf(cardId)}.png"`);
        expect(html).toContain('class="card-art"');
      }
    }
  });

  it('the back of a card (a card the player may not know) has no picture and names no card', () => {
    const html = renderToStaticMarkup(<CardFace cardId={null} />);
    expect(html).toContain('card-back');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('/user-art/');
  });

  it('a picture that fails to load is dropped for that card only: the drawn face is used instead', () => {
    const url = catalog.imageFor('ANM/W138-001')!.url;
    catalog.markFailed(url);
    expect(catalog.imageFor('ANM/W138-001')).toBeNull();
    expect(renderToStaticMarkup(<CardFace cardId="ANM/W138-001" />)).not.toContain('<img');
    expect(catalog.imageFor('ANM/W138-002')).not.toBeNull();
  });
});
