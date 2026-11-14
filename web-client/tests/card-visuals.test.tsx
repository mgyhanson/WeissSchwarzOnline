import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { allCards, getCard } from '@wso/card-database';
import { CardArt, hash } from '../src/components/CardArt';
import { CardFace } from '../src/components/CardFace';
import { ImageCatalog, cardIdOfFile, fileStemOf, licensedImages } from '../src/images/providers';
import { cardInfo } from '../src/model/cards';

const root = fileURLToPath(new URL('../../', import.meta.url));

describe('card faces', () => {
  it('every card has a face with its own data: name, number, level, cost, power, soul, triggers, original artwork', () => {
    for (const card of allCards()) {
      const id = card.record.cardId;
      const def = getCard(id).def;
      for (const size of ['small', 'normal', 'large'] as const) {
        const html = renderToStaticMarkup(<CardFace cardId={id} size={size} />);
        expect(html, `${id} ${size}`).toContain('class="card-art"');
        expect(html).toContain(def.name.replace(/&/g, '&amp;'));
        if (size !== 'small') expect(html).toContain(id);
        if (def.kind !== 'CLIMAX') expect(html).toContain(`<span class="c-lv ">${def.level}</span><span class="c-cost">${def.cost}</span>`);
        if (def.kind === 'CHARACTER') {
          expect(html).toContain(`<span class="c-pow ">${def.power}</span>`);
          expect(html).toMatch(new RegExp(`◆</span>${def.soul}</span>`));
        }
        expect((html.match(/class="c-icon trig-/g) ?? []).length).toBe(def.triggers.length);
      }
    }
  });

  it('shows the current values from the player view, marked when they differ from the printed ones', () => {
    const html = renderToStaticMarkup(<CardFace cardId="SY/W08-T07" stats={{ power: 10000, soul: 1, level: 2 }} />);
    expect(html).toContain('<span class="c-pow up">10000</span>');
    expect(html).toMatch(/c-soul down/);
  });

  it('a card nobody may see is drawn face down, with nothing about it', () => {
    const html = renderToStaticMarkup(<CardFace cardId={null} />);
    expect(html).toContain('card-back');
    expect(html).not.toMatch(/c-name|c-art/);
  });

  it('original artwork is the same for the same card and differs between cards', () => {
    const art = (id: string) => renderToStaticMarkup(<CardArt cardId={id} color={cardInfo(id).color} kind={cardInfo(id).kind} />).replace(/id="[^"]*"|url\(#[^)]*\)/g, '');
    expect(art('SY/W08-T01')).toBe(art('SY/W08-T01'));
    const ids = allCards().map((c) => c.record.cardId);
    const distinct = new Set(ids.map(art));
    // The drawn artwork is built from a limited set of shapes and colours; with several hundred cards
    // some share a design. At least 400 different designs must remain (card names and numbers always differ).
    expect(distinct.size).toBeGreaterThan(400);
    expect(new Set(ids.map(hash)).size).toBe(ids.length);
  });

  it('the official card page link is offered for every card', () => {
    for (const card of allCards()) expect(cardInfo(card.record.cardId).officialUrl).toBe(`https://ws-tcg.com/cardlist/?cardno=${card.record.cardId}`);
  });
});

describe('picture sources', () => {
  const complete = { cardId: 'SY/W08-T01', url: 'licensed/a.png', source: 'X', licence: 'GRANTED', permissionRef: 'mail 1', lastVerified: '2026-11-12', attribution: '© X' };

  it('only complete licensed entries with licence GRANTED are used', () => {
    const map = licensedImages([
      complete,
      { ...complete, cardId: 'SY/W08-T02', licence: 'PENDING' },
      { ...complete, cardId: 'SY/W08-T03', permissionRef: '' },
      { ...complete, cardId: 'SY/W08-T04', attribution: undefined },
    ]);
    expect([...map.keys()]).toEqual(['SY/W08-T01']);
  });

  it('licensed first, then the player’s own picture, then original artwork; a picture that fails is not tried again', () => {
    const catalog = new ImageCatalog(licensedImages([complete]));
    catalog.setUserManifest({ files: { 'SY/W08-T01': 'SY_W08-T01.png', 'SY/W08-T02': 'SY_W08-T02.webp' }, sources: { 'SY_W08-T02.webp': { source: 'drawn by me' } } });
    expect(catalog.imageFor('SY/W08-T01')).toMatchObject({ source: 'LICENSED', url: 'licensed/a.png' });
    expect(catalog.imageFor('SY/W08-T02')).toEqual({ source: 'USER', url: '/user-art/SY_W08-T02.webp', attribution: 'drawn by me' });
    expect(catalog.imageFor('SY/W08-T05')).toBeNull();
    catalog.markFailed('licensed/a.png');
    expect(catalog.imageFor('SY/W08-T01')).toMatchObject({ source: 'USER', url: '/user-art/SY_W08-T01.png' });
    catalog.markFailed('/user-art/SY_W08-T01.png');
    expect(catalog.imageFor('SY/W08-T01')).toBeNull();
  });

  it('file names follow the card number', () => {
    expect(fileStemOf('5HY/W83-T01')).toBe('5HY_W83-T01');
    expect(cardIdOfFile('5HY_W83-T01.png')).toBe('5HY/W83-T01');
    expect(cardIdOfFile('SY_W08-T06.webp')).toBe('SY/W08-T06');
  });

  it('the licensed list in the repository is empty: no permission has been obtained', () => {
    const list = JSON.parse(readFileSync(`${root}card-assets/licensed-images.json`, 'utf8')) as { images: unknown[] };
    expect(list.images).toEqual([]);
  });

  it('pictures the player provides are kept out of Git and out of builds', () => {
    const ignore = readFileSync(`${root}.gitignore`, 'utf8');
    expect(ignore).toMatch(/^card-assets\/local\.nosync\/$/m);
    const config = readFileSync(`${root}web-client/vite.config.ts`, 'utf8');
    // Served by the dev and preview servers only; no build hook copies them.
    expect(config).toMatch(/configureServer/);
    expect(config).not.toMatch(/generateBundle|writeBundle|publicDir/);
  });
});
