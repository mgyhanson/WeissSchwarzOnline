import { useMemo, useState } from 'react';
import { FORMATS, TEST_DECKS, type DeckCheck, getFormat, validateDeck } from '@wso/card-database';
import { type CardFilter, NO_FILTER, matches } from '../model/cardFilter';
import { type CardInfo, allCardIds, cardInfo, setSummaries } from '../model/cards';
import { type DeckStore, type SavedDeck, cleanDeckName, countIn, createDeck, importDeck, loadDecks, newDeckId, saveDecks, setCount, toCode, toCsv, toJson } from '../model/decks';
import { downloadText } from '../model/download';
import { COLOR_ZH, KIND_ZH, TRIGGER_ZH } from '../model/text';
import { CardFace } from './CardFace';
import { CardDetail, Modal } from './Sheets';

const PAGE = 48;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function Status({ check }: { check: DeckCheck }) {
  if (check.playable) return <span className="deck-status ok">合法，可以對戰</span>;
  if (check.legal) return <span className="deck-status warn">合法，但有未支援的卡</span>;
  return <span className="deck-status bad">不合法</span>;
}

function Problems({ check }: { check: DeckCheck }) {
  if (check.problems.length === 0 && check.unsupported.length === 0) return null;
  return (
    <ul className="deck-problems">
      {check.problems.map((p, i) => (
        <li key={`p${i}`} className="warning">
          {p.message}
        </li>
      ))}
      {check.unsupported.map((p, i) => (
        <li key={`u${i}`}>{p.message}</li>
      ))}
    </ul>
  );
}

function Stats({ check, deckSize, maxClimax }: { check: DeckCheck; deckSize: number; maxClimax: number }) {
  const s = check.stats;
  const row = (label: string, counts: Record<string, number>, names: Record<string, string>) => (
    <div className="deck-stat-row">
      <span className="muted">{label}</span>
      {Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, count]) => (
          <span key={key} className="chip">
            {names[key] ?? key} {count}
          </span>
        ))}
    </div>
  );
  return (
    <div className="deck-stats">
      <div className="deck-stat-row">
        <span className={`chip ${s.total === deckSize ? 'ok' : 'bad'}`}>
          總數 {s.total}／{deckSize}
        </span>
        <span className={`chip ${s.climaxes <= maxClimax ? 'ok' : 'bad'}`}>
          Climax {s.climaxes}／{maxClimax}
        </span>
        {check.titles.length > 0 && <span className="chip">Title：{check.titles.join('／')}</span>}
      </div>
      {row('顏色', s.byColor, COLOR_ZH)}
      {row('Level', s.byLevel, { '0': 'Lv0', '1': 'Lv1', '2': 'Lv2', '3': 'Lv3' })}
      {row('種類', s.byKind, KIND_ZH)}
      {row('Trigger', s.byTrigger, { ...TRIGGER_ZH, NONE: '沒有' })}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="filter">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">全部</option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Editor({ deck, onChange, onBack }: { deck: SavedDeck; onChange: (deck: SavedDeck) => void; onBack: () => void }) {
  const [filter, setFilter] = useState<CardFilter>({ ...NO_FILTER, support: 'verified' });
  const [trait, setTrait] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [pane, setPane] = useState<'cards' | 'deck'>('cards');
  const infos = useMemo(() => allCardIds().map(cardInfo), []);
  const summaries = useMemo(() => setSummaries(), []);
  const traits = useMemo(() => [...new Set(infos.flatMap((i) => i.traits))].sort((a, b) => a.localeCompare(b, 'ja')), [infos]);
  const format = getFormat(deck.format);
  const check = useMemo(() => validateDeck(deck.entries, format), [deck.entries, format]);
  const found = useMemo(() => infos.filter((info) => matches(info, filter) && (trait === '' || info.traits.includes(trait))), [infos, filter, trait]);
  const set = (patch: Partial<CardFilter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setShown(PAGE);
  };
  const distinct = (pick: (i: CardInfo) => number | null) =>
    [...new Set(infos.map(pick).filter((v): v is number => v !== null))].sort((a, b) => a - b).map((v): [string, string] => [String(v), String(v)]);
  const problemCards = new Set([...check.problems, ...check.unsupported].flatMap((p) => p.cardIds));
  const rows = deck.entries
    .map((e) => ({ ...e, info: cardInfo(e.cardId) }))
    .sort((a, b) => (a.info.kind === 'CLIMAX' ? 9 : (a.info.level ?? 0)) - (b.info.kind === 'CLIMAX' ? 9 : (b.info.level ?? 0)) || a.cardId.localeCompare(b.cardId));

  return (
    <div className="deck-editor">
      <section className="panel deck-head">
        <div className="deck-head-row">
          <button type="button" className="button small" onClick={onBack}>
            ← 卡組列表
          </button>
          <label className="deck-name">
            <span className="muted">卡組名稱</span>
            <input type="text" value={deck.name} maxLength={40} onChange={(e) => onChange({ ...deck, name: e.target.value })} onBlur={(e) => onChange({ ...deck, name: cleanDeckName(e.target.value) })} />
          </label>
          <label className="filter">
            <span>賽制</span>
            <select value={deck.format} onChange={(e) => onChange({ ...deck, format: e.target.value })}>
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nameZh}
                </option>
              ))}
            </select>
          </label>
          <Status check={check} />
        </div>
        <Stats check={check} deckSize={format.deckSize} maxClimax={format.maxClimax} />
        <Problems check={check} />
        <p className="muted">
          規則來源：官方「デッキ構築ルール」（{format.source.season}，{format.source.effectiveFrom} 起適用；{format.source.checkedOn} 查閱）。更改會自動保存在這個瀏覽器。
        </p>
      </section>

      <div className="deck-tabs mobile-only" role="tablist">
        <button type="button" role="tab" aria-selected={pane === 'cards'} className={`button small ${pane === 'cards' ? 'primary' : ''}`} onClick={() => setPane('cards')}>
          卡牌資料庫
        </button>
        <button type="button" role="tab" aria-selected={pane === 'deck'} className={`button small ${pane === 'deck' ? 'primary' : ''}`} onClick={() => setPane('deck')}>
          目前卡組（{check.stats.total}）
        </button>
      </div>

      <div className="deck-panes">
        <section className={`panel deck-pane-cards ${pane === 'cards' ? '' : 'pane-hidden'}`}>
          <h2>卡牌資料庫（{found.length}）</h2>
          <input className="search" type="search" placeholder="搜尋卡名、卡號、特徵或效果文字" value={filter.text} onChange={(e) => set({ text: e.target.value })} />
          <div className="filters">
            <Select label="系列" value={filter.set} onChange={(v) => set({ set: v })} options={summaries.map((s) => [s.id, `${s.title} ${s.product}`])} />
            <Select label="種類" value={filter.kind} onChange={(v) => set({ kind: v as CardFilter['kind'] })} options={Object.entries(KIND_ZH)} />
            <Select label="顏色" value={filter.color} onChange={(v) => set({ color: v })} options={Object.entries(COLOR_ZH)} />
            <Select label="Level" value={filter.level} onChange={(v) => set({ level: v })} options={distinct((i) => i.level)} />
            <Select label="Cost" value={filter.cost} onChange={(v) => set({ cost: v })} options={distinct((i) => i.cost)} />
            <Select label="Power 至少" value={filter.powerMin} onChange={(v) => set({ powerMin: v })} options={['3000', '5000', '7000', '9000', '10000'].map((v) => [v, v])} />
            <Select
              label="特徵"
              value={trait}
              onChange={(v) => {
                setTrait(v);
                setShown(PAGE);
              }}
              options={traits.map((t) => [t, t])}
            />
            <Select label="Trigger" value={filter.trigger} onChange={(v) => set({ trigger: v as CardFilter['trigger'] })} options={[['NONE', '沒有'], ...Object.entries(TRIGGER_ZH)]} />
            <label className="toggle">
              <input type="checkbox" checked={filter.support === 'verified'} onChange={(e) => set({ support: e.target.checked ? 'verified' : '' })} />
              只顯示可用於對戰的卡
            </label>
          </div>
          <p className="muted">點卡圖加入 1 張；按「詳情」放大查看完整效果。</p>
          <div className="deck-card-grid">
            {found.slice(0, shown).map((info) => {
              const n = countIn(deck, info.cardId);
              return (
                <div key={info.cardId} className={`deck-card ${n > 0 ? 'in-deck' : ''}`}>
                  <CardFace cardId={info.cardId} onClick={() => onChange(setCount(deck, info.cardId, n + 1))} />
                  {n > 0 && <span className="deck-card-count">×{n}</span>}
                  <span className="browser-name">{info.name}</span>
                  <span className="muted browser-meta">
                    {info.cardId}
                    {info.support !== 'verified' && <span className="warning"> 未支援</span>}
                  </span>
                  <button type="button" className="button small" onClick={() => setOpen(info.cardId)}>
                    詳情
                  </button>
                </div>
              );
            })}
            {found.length === 0 && <p className="muted">沒有符合條件的卡。</p>}
          </div>
          {found.length > shown && (
            <button type="button" className="button" onClick={() => setShown(shown + PAGE)}>
              顯示更多（還有 {found.length - shown} 張）
            </button>
          )}
        </section>

        <section className={`panel deck-pane-deck ${pane === 'deck' ? '' : 'pane-hidden'}`}>
          <h2>
            目前卡組（{check.stats.total}／{format.deckSize}）
          </h2>
          {rows.length === 0 && <p className="muted">還沒有卡。從卡牌資料庫點卡圖加入。</p>}
          <ul className="deck-rows">
            {rows.map(({ cardId, count, info }) => (
              <li key={cardId} className={`deck-row ${problemCards.has(cardId) ? 'problem' : ''}`}>
                <button type="button" className="deck-row-card" onClick={() => setOpen(cardId)} aria-label={`查看 ${info.name}`}>
                  <CardFace cardId={cardId} size="small" />
                </button>
                <div className="deck-row-text">
                  <span className="deck-row-name">{info.name}</span>
                  <span className="muted">
                    {cardId}・{info.kind === 'CLIMAX' ? 'Climax' : `Lv${info.level ?? 0}`}・{COLOR_ZH[info.color] ?? info.color}
                    {info.support !== 'verified' && <span className="warning"> 未支援</span>}
                  </span>
                </div>
                <div className="stepper">
                  <button type="button" className="button small" aria-label={`${info.name} 減少 1 張`} onClick={() => onChange(setCount(deck, cardId, count - 1))}>
                    −
                  </button>
                  <input type="number" min={0} max={99} value={count} aria-label={`${info.name} 的張數`} onChange={(e) => onChange(setCount(deck, cardId, Number(e.target.value)))} />
                  <button type="button" className="button small" aria-label={`${info.name} 增加 1 張`} onClick={() => onChange(setCount(deck, cardId, count + 1))}>
                    ＋
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {open && (
        <Modal title={cardInfo(open).name} onClose={() => setOpen(null)}>
          <CardDetail cardId={open} />
          <div className="decision-buttons">
            <button type="button" className="button primary" onClick={() => onChange(setCount(deck, open, countIn(deck, open) + 1))}>
              加入 1 張（現有 {countIn(deck, open)}）
            </button>
            {countIn(deck, open) > 0 && (
              <button type="button" className="button" onClick={() => onChange(setCount(deck, open, countIn(deck, open) - 1))}>
                移除 1 張
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export function DeckBuilder({ onDecksChanged }: { onDecksChanged: () => void }) {
  const [store, setStore] = useState<DeckStore>(() => loadDecks(storage()));
  const [editing, setEditing] = useState<string | null>(null);
  const [importText, setImportText] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [exported, setExported] = useState<{ title: string; text: string } | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const update = (next: DeckStore) => {
    setStore(next);
    setSaveFailed(!saveDecks(storage(), next));
    onDecksChanged();
  };
  const replace = (deck: SavedDeck) => update({ ...store, decks: store.decks.map((d) => (d.id === deck.id ? deck : d)) });
  const add = (deck: SavedDeck, open = true) => {
    update({ ...store, decks: [...store.decks, deck] });
    if (open) setEditing(deck.id);
  };

  const current = store.decks.find((d) => d.id === editing);
  if (current) return <Editor deck={current} onChange={replace} onBack={() => setEditing(null)} />;

  const doImport = () => {
    const result = importDeck(importText ?? '');
    if (!result.ok) {
      setImportErrors(result.errors);
      return;
    }
    setImportText(null);
    setImportErrors([]);
    add(result.deck, false);
  };

  return (
    <div className="home deck-list-screen">
      <section className="panel">
        <h2>我的卡組</h2>
        {saveFailed && <p className="warning">瀏覽器未能保存卡組（儲存空間已滿或被封鎖）。請先匯出卡組以免遺失。</p>}
        <div className="decision-buttons">
          <button type="button" className="button primary" onClick={() => add(createDeck(`新卡組 ${store.decks.length + 1}`))}>
            新增卡組
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              setImportText('');
              setImportErrors([]);
            }}
          >
            匯入卡組
          </button>
        </div>
        {store.decks.length === 0 && <p className="muted">還沒有自製卡組。可以新增空白卡組，或由下面的測試卡組複製一副再修改。</p>}
        <ul className="deck-list">
          {store.decks.map((deck) => {
            const check = validateDeck(deck.entries, getFormat(deck.format));
            return (
              <li key={deck.id} className="deck-item">
                <div className="deck-item-main">
                  <strong>{deck.name}</strong>
                  {store.defaultDeck === deck.id && <span className="chip ok">預設</span>}
                  <Status check={check} />
                  <span className="muted">
                    {getFormat(deck.format).nameZh}・{check.stats.total} 張・Climax {check.stats.climaxes}
                    {check.titles.length > 0 ? `・${check.titles.join('／')}` : ''}
                  </span>
                </div>
                <div className="deck-item-buttons">
                  <button type="button" className="button small primary" onClick={() => setEditing(deck.id)}>
                    編輯
                  </button>
                  <button type="button" className="button small" onClick={() => add({ ...deck, id: newDeckId(), name: cleanDeckName(`${deck.name} 複本`), updatedAt: new Date().toISOString() }, false)}>
                    複製
                  </button>
                  <button type="button" className="button small" onClick={() => update({ ...store, defaultDeck: store.defaultDeck === deck.id ? null : deck.id })} disabled={!check.playable && store.defaultDeck !== deck.id}>
                    {store.defaultDeck === deck.id ? '取消預設' : '設為預設'}
                  </button>
                  <button type="button" className="button small" onClick={() => setExported({ title: `匯出「${deck.name}」`, text: deck.id })}>
                    匯出
                  </button>
                  <button
                    type="button"
                    className="button small danger"
                    onClick={() => {
                      if (window.confirm(`確定刪除卡組「${deck.name}」嗎？這個動作不能復原。`)) {
                        update({ ...store, decks: store.decks.filter((d) => d.id !== deck.id), defaultDeck: store.defaultDeck === deck.id ? null : store.defaultDeck });
                      }
                    }}
                  >
                    刪除
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel">
        <h2>由測試卡組開始</h2>
        <p className="muted">複製一副本專案的測試卡組，再按自己的想法修改。</p>
        <ul className="deck-list">
          {TEST_DECKS.map((deck) => (
            <li key={deck.id} className="deck-item">
              <div className="deck-item-main">
                <strong>{deck.name}</strong>
              </div>
              <div className="deck-item-buttons">
                <button type="button" className="button small" onClick={() => add(createDeck(`${deck.name}（自製）`, 'NEO_STANDARD', deck.entries.map((e) => ({ ...e }))))}>
                  複製並編輯
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {importText !== null && (
        <Modal title="匯入卡組" onClose={() => setImportText(null)}>
          <p>貼上 JSON、CSV（card_id,count）或卡組代碼，或選擇檔案。</p>
          <input type="file" accept=".json,.csv,.txt,application/json,text/csv,text/plain" onChange={(e) => void e.target.files?.[0]?.text().then(setImportText)} />
          <textarea className="import-text" rows={8} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'card_id,count\nSAO/S20-001,4'} />
          {importErrors.length > 0 && (
            <ul className="deck-problems">
              {importErrors.map((error, i) => (
                <li key={i} className="warning">
                  {error}
                </li>
              ))}
            </ul>
          )}
          <div className="decision-buttons">
            <button type="button" className="button primary" onClick={doImport}>
              匯入
            </button>
            <button type="button" className="button" onClick={() => setImportText(null)}>
              取消
            </button>
          </div>
          <p className="muted">有任何卡號不在資料庫或張數不正確，都會列出並停止匯入，不會自動略過。</p>
        </Modal>
      )}

      {exported &&
        (() => {
          const deck = store.decks.find((d) => d.id === exported.text);
          if (!deck) return null;
          const safe = deck.name.replace(/[^\p{L}\p{N}_-]+/gu, '_');
          return (
            <Modal title={exported.title} onClose={() => setExported(null)}>
              <div className="decision-buttons">
                <button type="button" className="button" onClick={() => downloadText(`${safe}.json`, toJson(deck))}>
                  下載 JSON
                </button>
                <button type="button" className="button" onClick={() => downloadText(`${safe}.csv`, `﻿${toCsv(deck)}`, 'text/csv')}>
                  下載 CSV
                </button>
              </div>
              <label className="file-input">
                卡組代碼（可複製貼給朋友，或在「匯入卡組」貼上）
                <textarea className="import-text" rows={4} readOnly value={toCode(deck)} onFocus={(e) => e.target.select()} />
              </label>
            </Modal>
          );
        })()}
    </div>
  );
}
