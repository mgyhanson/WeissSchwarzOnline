import { useState } from 'react';
import { Game } from './components/Game';
import { CardList, Glossary, Home } from './components/Screens';
import { type GameSetup, LocalHost, type SavedGame, loadSaved, randomSeed } from './host/local';

type Screen = 'home' | 'game' | 'cards' | 'glossary';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [host, setHost] = useState<LocalHost | null>(null);
  const [hasSaved, setHasSaved] = useState(() => loadSaved(storage()) !== null);

  // The previous host is disposed when a new game replaces it (not in an
  // effect: StrictMode runs effect clean-ups twice in development).
  const start = (setup: GameSetup, entries?: SavedGame['entries']) => {
    host?.dispose();
    setHost(new LocalHost(setup, { storage: storage(), ...(entries ? { entries } : {}) }));
    setHasSaved(true);
    setScreen('game');
  };

  const nav = (target: Screen, label: string) => (
    <button type="button" className={`nav-button ${screen === target ? 'current' : ''}`} onClick={() => setScreen(target)} aria-current={screen === target ? 'page' : undefined}>
      {label}
    </button>
  );

  return (
    <div className={`app screen-${screen}`}>
      <header className="app-header">
        <h1>
          WS 社群模擬器 <span className="badge-unofficial">非官方</span>
        </h1>
        <nav>
          {nav('home', '主頁')}
          {host && nav('game', '對局')}
          {nav('cards', '卡牌')}
          {nav('glossary', '術語')}
        </nav>
      </header>
      <main>
        {screen === 'home' && (
          <Home
            hasSaved={hasSaved}
            onStart={(decks) => start({ seed: randomSeed(), decks })}
            onContinue={() => {
              if (host) return setScreen('game');
              const saved = loadSaved(storage());
              if (saved) start(saved.setup, saved.entries);
            }}
          />
        )}
        {screen === 'game' && host && <Game host={host} onLeave={() => setScreen('home')} onNewGame={() => start({ seed: randomSeed(), decks: host.setup.decks })} />}
        {screen === 'cards' && <CardList />}
        {screen === 'glossary' && <Glossary />}
      </main>
      <footer className="app-footer">
        非官方的社群專案，與 Bushiroad 及各作品權利人無關。卡牌名稱及文字 © Bushiroad 及各權利人，只作私人非商業參考。
      </footer>
    </div>
  );
}
