import { useMemo, useState } from 'react';
import { TEST_DECKS } from '@wso/card-database';
import { allCardIds, cardInfo } from '../model/cards';
import { GLOSSARY, type Term } from '../model/glossary';
import { COLOR_ZH, KIND_ZH } from '../model/text';
import { CardFace } from './CardFace';
import { CardDetail, Modal } from './Sheets';

export function Home({
  hasSaved,
  onStart,
  onContinue,
}: {
  hasSaved: boolean;
  onStart: (decks: [string, string]) => void;
  onContinue: () => void;
}) {
  const [mine, setMine] = useState(TEST_DECKS[0]!.id);
  const [theirs, setTheirs] = useState(TEST_DECKS[1]!.id);
  return (
    <div className="home">
      <section className="panel">
        <h2>單機練習對局</h2>
        <p>
          與「練習對手」對戰。練習對手只按簡單規則行動，用來試玩介面及規則；正式的四種難度 AI 會在下一步（STEP 8）加入。練習對手只能看到它自己座位可以看到的資訊。
        </p>
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
        <div className="decision-buttons">
          <button type="button" className="button primary" onClick={() => onStart([mine, theirs])}>
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

export function CardList() {
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const ids = useMemo(() => allCardIds(), []);
  const shown = ids.filter((id) => {
    if (!filter) return true;
    const info = cardInfo(id);
    return `${id} ${info.name} ${info.traits.join(' ')} ${info.text.join(' ')}`.toLowerCase().includes(filter.toLowerCase());
  });
  return (
    <div className="panel">
      <h2>卡牌一覽（{shown.length}/{ids.length}）</h2>
      <input className="search" type="search" placeholder="搜尋卡名、卡號、特徵或文字" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="card-table">
        {shown.map((id) => {
          const info = cardInfo(id);
          return (
            <button key={id} type="button" className="card-row" onClick={() => setOpen(id)}>
              <CardFace cardId={id} size="small" />
              <span className="card-row-text">
                <span className="card-row-name">{info.name}</span>
                <span className="muted">
                  {id}・{KIND_ZH[info.kind]}・{COLOR_ZH[info.color]}
                  {info.kind !== 'CLIMAX' ? `・Lv${info.level}／Cost${info.cost}` : ''}
                  {info.kind === 'CHARACTER' ? `・${info.power}／Soul ${info.soul}` : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>
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
