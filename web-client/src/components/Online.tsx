import { useState, useSyncExternalStore } from 'react';
import { TEST_DECKS } from '@wso/card-database';
import { CODE_PATTERN, type LobbySeat, NAME_MAX } from '@wso/server/shared';
import type { OnlineClient } from '../host/remote';

const NAME_KEY = 'wso.playerName';

function savedName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    // Not remembered; it still works.
  }
}

function DeckSelect({ value, onChange, disabled = false }: { value: string; onChange: (deck: string) => void; disabled?: boolean }) {
  return (
    <label>
      你的卡組
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {TEST_DECKS.map((deck) => (
          <option key={deck.id} value={deck.id}>
            {deck.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function RulesNote({ graceMinutes }: { graceMinutes: number | null }) {
  return (
    <ul className="muted online-rules">
      <li>對局在伺服器上進行。你的瀏覽器只會收到你這個座位可以看到的資訊；對手的手牌、山札次序及 Stock 內容不會傳送給你。</li>
      <li>重新整理頁面或連線中斷都不會失去座位，會自動回到對局。</li>
      <li>
        對局中如果一方斷線而另一方在等候，斷線的一方有 {graceMinutes ?? 10} 分鐘時間回來，否則系統代他投降。這是本平台的規則，不是 Weiß Schwarz 的遊戲規則。雙方都斷線時對局會一直保留。
      </li>
      <li>只限私人與朋友使用：請不要把房間公開宣傳。卡牌文字的版權屬 Bushiroad 及各權利人。</li>
    </ul>
  );
}

function seatText(seat: LobbySeat | null, mine: boolean): string {
  if (!seat) return '（等待加入）';
  const parts = [mine ? `${seat.name}（你）` : seat.name];
  if (seat.left) parts.push('已離開');
  else parts.push(seat.connected ? '在線' : '離線');
  if (seat.ready) parts.push('已準備');
  if (seat.rematch) parts.push('想再戰');
  return parts.join('・');
}

export function OnlineScreen({ client, initialCode, onOpenGame }: { client: OnlineClient; initialCode: string; onOpenGame: () => void }) {
  const snap = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const [name, setName] = useState(savedName);
  const [deck, setDeck] = useState(TEST_DECKS[0]!.id);
  const [code, setCode] = useState(initialCode);
  const [copied, setCopied] = useState(false);
  const lobby = snap.lobby;

  const status =
    snap.connection === 'connecting' ? '正在連接伺服器…' : snap.connection === 'reconnecting' ? '與伺服器的連線中斷，正在重新連線…' : null;

  if (!snap.session) {
    const codeOk = CODE_PATTERN.test(code.trim().toUpperCase());
    return (
      <div className="home online">
        <section className="panel">
          <h2>網上對戰（雙人）</h2>
          {snap.error && <p className="warning">{snap.error}</p>}
          {status && <p className="notice">{status}</p>}
          <div className="form-row">
            <label>
              你的名稱
              <input type="text" value={name} maxLength={NAME_MAX} placeholder="玩家" onChange={(e) => setName(e.target.value)} />
            </label>
            <DeckSelect value={deck} onChange={setDeck} />
          </div>
          <div className="online-choices">
            <div>
              <h3>建立房間</h3>
              <p className="muted">建立後把房間代碼或邀請連結傳給朋友。</p>
              <button
                type="button"
                className="button primary"
                disabled={snap.connection === 'connecting'}
                onClick={() => {
                  saveName(name);
                  client.create(name, deck);
                }}
              >
                建立房間
              </button>
            </div>
            <div>
              <h3>加入房間</h3>
              <label>
                房間代碼
                <input
                  type="text"
                  className="room-code-input"
                  value={code}
                  maxLength={6}
                  placeholder="例如 K7QX2M"
                  autoCapitalize="characters"
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </label>
              <button
                type="button"
                className="button"
                disabled={!codeOk || snap.connection === 'connecting'}
                onClick={() => {
                  saveName(name);
                  client.join(code, name, deck);
                }}
              >
                加入房間
              </button>
            </div>
          </div>
        </section>
        <section className="panel">
          <h2>說明</h2>
          <RulesNote graceMinutes={null} />
        </section>
      </div>
    );
  }

  if (!lobby) {
    return (
      <div className="home online">
        <section className="panel">
          <h2>網上對戰</h2>
          <p className="notice">{status ?? '正在回到房間…'}</p>
          {snap.error && <p className="warning">{snap.error}</p>}
          <button type="button" className="button" onClick={() => client.leave()}>
            放棄並離開房間
          </button>
        </section>
      </div>
    );
  }

  const me = lobby.you.seat;
  const mine = lobby.seats[me];
  const theirs = lobby.seats[me === 0 ? 1 : 0];
  const link = `${window.location.origin}/?room=${lobby.code}`;
  const copy = () => {
    void navigator.clipboard?.writeText(link).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <div className="home online">
      <section className="panel">
        <h2>
          房間 <span className="room-code" data-testid="room-code">{lobby.code}</span>
        </h2>
        {status && <p className="notice">{status}</p>}
        {snap.error && <p className="warning">{snap.error}</p>}
        <div className="invite">
          <span className="muted">邀請連結：</span>
          <code className="invite-link">{link}</code>
          <button type="button" className="button small" onClick={copy}>
            {copied ? '已複製' : '複製'}
          </button>
        </div>
        <ul className="seat-list">
          <li className="seat mine">{seatText(mine, true)}</li>
          <li className="seat">{seatText(theirs, false)}</li>
        </ul>

        {lobby.status === 'LOBBY' && (
          <>
            <div className="form-row">
              <DeckSelect value={lobby.you.deck} onChange={(d) => client.setDeck(d)} disabled={!!mine?.ready} />
            </div>
            <div className="decision-buttons">
              <button type="button" className={`button ${mine?.ready ? '' : 'primary'}`} onClick={() => client.setReady(!mine?.ready)}>
                {mine?.ready ? '取消準備' : '準備'}
              </button>
              <button type="button" className="button" onClick={() => client.leave()}>
                離開房間
              </button>
            </div>
            <p className="muted">{theirs ? '雙方都按「準備」後對局就會開始，先後攻由系統隨機決定。' : '等待對手加入。'}</p>
          </>
        )}

        {lobby.status !== 'LOBBY' && (
          <>
            <p>{lobby.status === 'PLAYING' ? `第 ${lobby.game} 局進行中。` : `第 ${lobby.game} 局已結束。`}</p>
            {lobby.status === 'FINISHED' && (
              <div className="form-row">
                <DeckSelect value={lobby.you.deck} onChange={(d) => client.setDeck(d)} disabled={!!mine?.rematch} />
              </div>
            )}
            <div className="decision-buttons">
              {snap.game && (
                <button type="button" className="button primary" onClick={onOpenGame}>
                  {lobby.status === 'PLAYING' ? '回到對局' : '查看對局'}
                </button>
              )}
              {lobby.status === 'FINISHED' && theirs && !theirs.left && (
                <button type="button" className="button" onClick={() => client.rematch()} disabled={!!mine?.rematch}>
                  {mine?.rematch ? '已要求再戰' : '再戰'}
                </button>
              )}
              <button
                type="button"
                className="button"
                onClick={() => {
                  if (lobby.status !== 'PLAYING' || window.confirm('離開房間會立即投降（CR-1.2.4），確定嗎？')) client.leave();
                }}
              >
                {lobby.status === 'PLAYING' ? '投降並離開房間' : '離開房間'}
              </button>
            </div>
          </>
        )}
      </section>
      <section className="panel">
        <h2>說明</h2>
        <RulesNote graceMinutes={Math.round(lobby.graceMs / 60000)} />
      </section>
    </div>
  );
}
