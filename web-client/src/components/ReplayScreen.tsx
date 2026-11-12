import { useState } from 'react';
import type { PlayerId } from '@wso/game-engine';
import { type Replay, checkReplay } from '@wso/server/shared';

const RESULT_ZH = { LEVEL_4: '達到 Level 4', NO_CARDS: '山札及控え室都沒有卡', RESIGNED: '投降' } as const;

/** Choose a replay file and whose point of view to watch it from. */
export function ReplayScreen({ onOpen }: { onOpen: (replay: Replay, seat: PlayerId) => void }) {
  const [replay, setReplay] = useState<Replay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const read = (file: File | undefined) => {
    setReplay(null);
    setError(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('檔案太大，不是重播檔。');
      return;
    }
    setChecking(true);
    void file.text().then((text) => {
      // Checking runs the whole game through the engine; let the page paint first.
      setTimeout(() => {
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          setChecking(false);
          setError('無法讀取檔案：這不是 JSON 格式的重播檔。');
          return;
        }
        const checked = checkReplay(data);
        setChecking(false);
        if (checked.ok) setReplay(checked.replay);
        else setError(checked.message);
      }, 0);
    });
  };

  const result = replay?.result;
  return (
    <div className="home replay-screen">
      <section className="panel">
        <h2>觀看重播</h2>
        <p>重播檔在對局結束後才可以下載（對局結束畫面的「下載重播檔」），因為它包含整局的種子，可以看到所有隱藏的卡。</p>
        <label className="file-input">
          選擇重播檔（.json）
          <input type="file" accept="application/json,.json" onChange={(e) => read(e.target.files?.[0])} />
        </label>
        {checking && <p className="notice">正在核對重播檔…</p>}
        {error && <p className="warning">{error}</p>}
        {replay && (
          <div className="replay-summary">
            <p>
              {replay.source === 'online' ? '網上對戰' : '單機對戰'}・{new Date(replay.createdAt).toLocaleString()}・{replay.entries.length} 個行動・規則 {replay.rulesVersion}
            </p>
            <p>
              {replay.players[0]}（{replay.decks[0].name}） 對 {replay.players[1]}（{replay.decks[1].name}）
            </p>
            {result && <p>結果：{result.outcome === 'DRAW' ? '和局' : `${replay.players[result.winner]}勝出（${replay.players[result.loser]}${RESULT_ZH[result.reason]}）`}</p>}
            <div className="decision-buttons">
              {([0, 1] as const).map((seat) => (
                <button key={seat} type="button" className="button primary" onClick={() => onOpen(replay, seat)}>
                  以「{replay.players[seat]}」的視角觀看
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
