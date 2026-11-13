import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { PlayerId } from '@wso/game-engine';
import type { Replay } from '@wso/server/shared';
import { Game } from './components/Game';
import { OnlineScreen } from './components/Online';
import { ReplayScreen } from './components/ReplayScreen';
import { DeckBuilder } from './components/DeckBuilder';
import { CardList, Glossary, Home } from './components/Screens';
import { type GameSetup, LocalHost, type SavedGame, loadSaved, randomSeed } from './host/local';
import { OnlineClient, loadOnlineSession } from './host/remote';
import { ReplayHost } from './host/replay';
import { defaultDeckId, loadDecks, playableDecks } from './model/decks';

type Screen = 'home' | 'game' | 'online' | 'online-game' | 'replay' | 'decks' | 'cards' | 'glossary';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** ?room=CODE from an invite link. */
function roomFromUrl(): string {
  try {
    return (new URLSearchParams(window.location.search).get('room') ?? '').toUpperCase().slice(0, 6);
  } catch {
    return '';
  }
}

export function App() {
  const [invite] = useState(roomFromUrl);
  // A saved online seat (reload) or an invite link opens the online screen.
  const [online] = useState(() => new OnlineClient({ storage: storage() }));
  const [screen, setScreen] = useState<Screen>(() => (loadOnlineSession(storage()) || invite ? 'online' : 'home'));
  const [host, setHost] = useState<LocalHost | null>(null);
  const [hasSaved, setHasSaved] = useState(() => loadSaved(storage()) !== null);
  const [replayHost, setReplayHost] = useState<ReplayHost | null>(null);
  const [replayBack, setReplayBack] = useState<Screen>('replay');
  // The decks a game can use; re-read when the deck builder changes them.
  const [deckVersion, setDeckVersion] = useState(0);
  const deckStore = useMemo(() => loadDecks(storage()), [deckVersion]);
  const decks = useMemo(() => playableDecks(deckStore), [deckStore]);

  const onlineSnap = useSyncExternalStore(online.subscribe, online.getSnapshot);
  const onlineGame = onlineSnap.game;
  const lobby = onlineSnap.lobby;

  // Back to the saved seat once, on load.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    if (online.getSnapshot().session) online.resume();
  }, [online]);

  // A new online game (start, rematch, or back after a reload) opens the board.
  const shownGame = useRef<number | null>(null);
  useEffect(() => {
    if (!onlineGame || shownGame.current === onlineGame.gameNo) return;
    shownGame.current = onlineGame.gameNo;
    setScreen('online-game');
  }, [onlineGame]);

  // Leaving the room returns to the online screen.
  useEffect(() => {
    if (screen === 'online-game' && !onlineGame) setScreen('online');
  }, [screen, onlineGame]);

  // The previous host is disposed when a new game replaces it (not in an
  // effect: StrictMode runs effect clean-ups twice in development).
  const start = (setup: GameSetup, entries?: SavedGame['entries']) => {
    host?.dispose();
    setHost(new LocalHost(setup, { storage: storage(), ...(entries ? { entries } : {}) }));
    setHasSaved(true);
    setScreen('game');
  };

  const watch = (replay: Replay, seat: PlayerId, back: Screen) => {
    replayHost?.dispose();
    setReplayHost(new ReplayHost(replay, seat));
    setReplayBack(back);
    setScreen('replay');
  };

  const nav = (target: Screen, label: string, current = screen === target) => (
    <button type="button" className={`nav-button ${current ? 'current' : ''}`} onClick={() => setScreen(target)} aria-current={current ? 'page' : undefined}>
      {label}
    </button>
  );

  const rematchNote = () => {
    if (!lobby || lobby.status !== 'FINISHED') return null;
    const mine = lobby.seats[lobby.you.seat];
    const theirs = lobby.seats[lobby.you.seat === 0 ? 1 : 0];
    if (theirs?.left) return <p className="muted">對手已離開房間。</p>;
    if (mine?.rematch) return <p className="muted">已要求再戰，等待對手同意…</p>;
    if (theirs?.rematch) return <p className="notice">對手想再戰。</p>;
    return null;
  };

  return (
    <div className={`app screen-${screen}`}>
      <header className="app-header">
        <h1>
          WS 社群模擬器 <span className="badge-unofficial">非官方</span>
        </h1>
        <nav>
          {nav('home', '主頁')}
          {host && nav('game', '對局')}
          {nav(onlineGame && lobby?.status === 'PLAYING' ? 'online-game' : 'online', '網上對戰', screen === 'online' || screen === 'online-game')}
          {nav('decks', '卡組')}
          {nav('replay', '重播')}
          {nav('cards', '卡牌')}
          {nav('glossary', '術語')}
        </nav>
      </header>
      <main>
        {screen === 'home' && (
          <Home
            hasSaved={hasSaved}
            decks={decks}
            defaultDeck={defaultDeckId(deckStore, decks)}
            onDecks={() => setScreen('decks')}
            onStart={(ids, level) => {
              const chosen = ids.map((id) => decks.find((d) => d.id === id)!) as [(typeof decks)[number], (typeof decks)[number]];
              start({ seed: randomSeed(), decks: ids, level, lists: [chosen[0].cards, chosen[1].cards], deckNames: [chosen[0].name, chosen[1].name] });
            }}
            onContinue={() => {
              if (host) return setScreen('game');
              const saved = loadSaved(storage());
              if (saved) start(saved.setup, saved.entries);
            }}
            onOnline={() => setScreen('online')}
          />
        )}
        {screen === 'game' && host && (
          <Game
            key={host.setup.seed}
            host={host}
            onLeave={() => setScreen('home')}
            onNewGame={() => start({ ...host.setup, seed: randomSeed(), level: host.setup.level ?? 'NORMAL' })}
            onWatchReplay={(replay) => watch(replay, 0, 'game')}
          />
        )}
        {screen === 'online' && <OnlineScreen client={online} initialCode={invite} onOpenGame={() => setScreen('online-game')} decks={decks} defaultDeck={defaultDeckId(deckStore, decks)} />}
        {screen === 'online-game' && onlineGame && (
          <Game
            key={`online-${onlineGame.gameNo}`}
            host={onlineGame}
            onLeave={() => setScreen('online')}
            leaveLabel="回房間"
            {...(lobby?.status === 'FINISHED' && !lobby.seats[lobby.you.seat === 0 ? 1 : 0]?.left && !lobby.seats[lobby.you.seat]?.rematch
              ? { onNewGame: () => online.rematch(), newGameLabel: '再戰' }
              : {})}
            onWatchReplay={(replay) => watch(replay, onlineGame.seat, 'online-game')}
            endNote={rematchNote()}
          />
        )}
        {screen === 'replay' &&
          (replayHost ? (
            <Game
              key={`replay-${replayHost.replay.seed}-${replayHost.seat}`}
              host={replayHost}
              leaveLabel="離開重播"
              onLeave={() => {
                replayHost.dispose();
                setReplayHost(null);
                setScreen(replayBack);
              }}
            />
          ) : (
            <ReplayScreen onOpen={(replay, seat) => watch(replay, seat, 'replay')} />
          ))}
        {screen === 'decks' && <DeckBuilder onDecksChanged={() => setDeckVersion((v) => v + 1)} />}
        {screen === 'cards' && <CardList />}
        {screen === 'glossary' && <Glossary />}
      </main>
      <footer className="app-footer">
        非官方的社群專案，與 Bushiroad 及各作品權利人無關。卡牌名稱及文字 © Bushiroad 及各權利人，只作私人非商業參考。
      </footer>
    </div>
  );
}
