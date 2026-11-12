import { useMemo, useState } from 'react';
import { AI_LEVELS, AI_LEVEL_ZH, type AiLevel } from '@wso/ai';
import { TEST_DECKS } from '@wso/card-database';
import { type CardFilter, NO_FILTER, matches } from '../model/cardFilter';
import { allCardIds, cardInfo, setSummaries } from '../model/cards';
import { GLOSSARY, type Term } from '../model/glossary';
import { COLOR_ZH, KIND_ZH, TRIGGER_ZH } from '../model/text';
import { CardFace } from './CardFace';
import { CardDetail, Modal } from './Sheets';

const LEVEL_TEXT: Record<AiLevel, string> = {
  BEGINNER: '能出就出、能攻就攻，隨機選目標。',
  NORMAL: '比較 Power 決定攻擊方式，安全時才放 Clock。',
  ADVANCED: '再考慮 Climax Combo、Cancel 機率、保留 Stock，對手接近落敗時全力進攻。',
  EXPERT: '在多個按公開資訊推測的局面中模擬每個選項，選平均結果最好的。每步思考通常不到 0.3 秒。',
};

export function Home({
  hasSaved,
  onStart,
  onContinue,
}: {
  hasSaved: boolean;
  onStart: (decks: [string, string], level: AiLevel) => void;
  onContinue: () => void;
}) {
  const [mine, setMine] = useState(TEST_DECKS[0]!.id);
  const [theirs, setTheirs] = useState(TEST_DECKS[1]!.id);
  const [level, setLevel] = useState<AiLevel>('NORMAL');
  return (
    <div className="home">
      <section className="panel">
        <h2>單機對戰電腦</h2>
        <p>電腦對手不會作弊：它只看到自己座位可以看到的資訊，和真人玩家一樣。</p>
        <div className="form-row">
          <label>
            你的卡組
            <select value={mine} onChange={(e) => setMine(e.target.value)}>
              {TEST_DECKS.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            對手的卡組
            <select value={theirs} onChange={(e) => setTheirs(e.target.value)}>
              {TEST_DECKS.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="level-choice">
          <legend>電腦難度</legend>
          {AI_LEVELS.map((l) => (
            <label key={l} className={`level-option ${level === l ? 'current' : ''}`}>
              <input type="radio" name="level" value={l} checked={level === l} onChange={() => setLevel(l)} />
              <span className="level-name">{AI_LEVEL_ZH[l]}</span>
              <span className="muted">{LEVEL_TEXT[l]}</span>
            </label>
          ))}
        </fieldset>
        <div className="decision-buttons">
          <button type="button" className="button primary" onClick={() => onStart([mine, theirs], level)}>
            開始新對局
          </button>
          {hasSaved && (
            <button type="button" className="button" onClick={onContinue}>
              繼續上一局
            </button>
          )}
        </div>
        <p className="muted">
          兩副都是本專案用 Trial Deck 的卡自行組成的測試卡組，不是官方的固定卡表。先後攻由系統隨機決定。對局會保存在這個瀏覽器，重新整理頁面後可以繼續。
        </p>
      </section>
      <section className="panel">
        <h2>規則依據</h2>
        <p>
          規則引擎按官方《総合ルール》JP ver. 1.114 編寫。已支援的卡牌全部由引擎自動執行，並逐張有測試。卡牌只顯示文字資料，不使用官方卡圖；每張卡都附官方卡表連結。
        </p>
      </section>
    </div>
  );
}

const SUPPORT_ZH = { verified: '可自動執行', pending: '待核實', unsupported: '未確認 — 暫不支援自動執行' } as const;

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

export function CardList() {
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<CardFilter>(NO_FILTER);
  const ids = useMemo(() => allCardIds(), []);
  const infos = useMemo(() => ids.map(cardInfo), [ids]);
  const summaries = useMemo(() => setSummaries(), []);
  const shown = infos.filter((info) => matches(info, filter));
  const set = (patch: Partial<CardFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const distinct = (pick: (i: (typeof infos)[number]) => number | null) =>
    [...new Set(infos.map(pick).filter((v): v is number => v !== null))].sort((a, b) => a - b).map((v): [string, string] => [String(v), String(v)]);
  return (
    <div className="card-browser">
      <section className="panel">
        <h2>已匯入的系列</h2>
        <div className="set-table" role="table">
          <div className="set-row set-head" role="row">
            <span role="columnheader">系列</span>
            <span role="columnheader">卡數</span>
            <span role="columnheader">可自動執行</span>
            <span role="columnheader">待核實</span>
            <span role="columnheader">不支援</span>
          </div>
          {summaries.map((s) => (
            <button key={s.id} type="button" role="row" className={`set-row ${filter.set === s.id ? 'current' : ''}`} onClick={() => set({ set: filter.set === s.id ? '' : s.id })}>
              <span role="cell">
                <strong>{s.title}</strong> {s.product}
              </span>
              <span role="cell">{s.total}</span>
              <span role="cell" className="ok">{s.verified}</span>
              <span role="cell">{s.pending}</span>
              <span role="cell">{s.unsupported}</span>
            </button>
          ))}
        </div>
        <p className="muted">只有「可自動執行」的卡可以放入對戰卡組；其他卡只供查閱。</p>
      </section>
      <section className="panel">
        <h2>
          卡牌一覽（{shown.length}/{ids.length}）
        </h2>
        <input className="search" type="search" placeholder="搜尋卡名、卡號、特徵、效果或中文說明" value={filter.text} onChange={(e) => set({ text: e.target.value })} />
        <div className="filters">
          <Select label="系列" value={filter.set} onChange={(v) => set({ set: v })} options={summaries.map((s) => [s.id, `${s.title} ${s.product}`])} />
          <Select label="種類" value={filter.kind} onChange={(v) => set({ kind: v as CardFilter['kind'] })} options={Object.entries(KIND_ZH)} />
          <Select label="顏色" value={filter.color} onChange={(v) => set({ color: v })} options={Object.entries(COLOR_ZH)} />
          <Select label="Level" value={filter.level} onChange={(v) => set({ level: v })} options={distinct((i) => i.level)} />
          <Select label="Cost" value={filter.cost} onChange={(v) => set({ cost: v })} options={distinct((i) => i.cost)} />
          <Select label="Soul" value={filter.soul} onChange={(v) => set({ soul: v })} options={distinct((i) => i.soul)} />
          <Select label="Power 至少" value={filter.powerMin} onChange={(v) => set({ powerMin: v })} options={['3000', '5000', '7000', '9000', '10000'].map((v) => [v, v])} />
          <Select label="Trigger" value={filter.trigger} onChange={(v) => set({ trigger: v as CardFilter['trigger'] })} options={[['NONE', '沒有'], ...Object.entries(TRIGGER_ZH)]} />
          <Select label="支援" value={filter.support} onChange={(v) => set({ support: v as CardFilter['support'] })} options={Object.entries(SUPPORT_ZH)} />
          <button type="button" className="button small" onClick={() => setFilter(NO_FILTER)}>
            清除篩選
          </button>
        </div>
        <div className="card-grid-browser">
          {shown.map((info) => (
            <div key={info.cardId} className="browser-card">
              <CardFace cardId={info.cardId} onClick={() => setOpen(info.cardId)} />
              <span className="browser-name">{info.name}</span>
              <span className="muted browser-meta">
                {info.cardId}
                {info.support !== 'verified' && <span className="warning"> {SUPPORT_ZH[info.support]}</span>}
              </span>
            </div>
          ))}
          {shown.length === 0 && <p className="muted">沒有符合條件的卡。</p>}
        </div>
      </section>
      {open && (
        <Modal title={cardInfo(open).name} onClose={() => setOpen(null)}>
          <CardDetail cardId={open} />
        </Modal>
      )}
    </div>
  );
}

export function Glossary() {
  const groups = [...new Set(GLOSSARY.map((t) => t.group))];
  const byGroup = (group: Term['group']) => GLOSSARY.filter((t) => t.group === group);
  return (
    <div className="panel glossary">
      <h2>術語解釋</h2>
      <p className="muted">本專案自行撰寫的說明，非官方；以官方《総合ルール》（JP ver. 1.114）為準，條號可在官方 PDF 查閱。</p>
      {groups.map((group) => (
        <section key={group}>
          <h3>{group}</h3>
          <dl>
            {byGroup(group).map((t) => (
              <div key={t.id} className="term" id={`term-${t.id}`}>
                <dt>{t.name}</dt>
                <dd>
                  {t.text}
                  {t.rules.length > 0 && <span className="muted">（{t.rules.join('、')}）</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
