import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG, FIXED_DT, createGame, step } from '../../lib/freedom-pit';
import type { GameState } from '../../lib/freedom-pit';
import DesktopOnly from './DesktopOnly';
import Hud, { formatClock, readHud } from './Hud';
import type { HudModel } from './Hud';
import { attachInput } from './input';
import type { InputSource } from './input';
import { draw } from './render';
import { useGameLoop } from './useGameLoop';
import { WindAudio, isAudioSupported } from './windAudio';

type Screen = 'title' | 'playing' | 'paused' | 'won' | 'lost';

const BEST_KEY = 'freedom-pit:best-seconds';
const MUTED_KEY = 'freedom-pit:muted';
const HUD_INTERVAL = 0.1; // seconds — 10 Hz is plenty for numbers

export default function FreedomPit() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GameState | null>(null);
  const inputRef = useRef<InputSource | null>(null);
  const audioRef = useRef<WindAudio | null>(null);
  const hudClock = useRef(0);
  const [muted, setMuted] = useState(false);

  const [screen, setScreen] = useState<Screen>('title');
  const [hud, setHud] = useState<HudModel | null>(null);
  const [best, setBest] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [audioStatus, setAudioStatus] = useState<ReturnType<WindAudio['status']> | null>(null);
  // null until measured on the client, so the server and first paint agree.
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const wide = window.matchMedia('(min-width: 768px)');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setIsDesktop(wide.matches);
      setReducedMotion(motion.matches);
    };
    sync();
    wide.addEventListener('change', sync);
    motion.addEventListener('change', sync);
    try {
      const stored = window.localStorage.getItem(BEST_KEY);
      if (stored) setBest(Number(stored));
      setMuted(window.localStorage.getItem(MUTED_KEY) === '1');
    } catch {
      // Private mode or storage disabled — a missing best time is not an error.
    }
    return () => {
      wide.removeEventListener('change', sync);
      motion.removeEventListener('change', sync);
    };
  }, []);

  // Size the backing store to the device pixel ratio so the art stays crisp.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isDesktop) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = CONFIG.view.width * dpr;
    canvas.height = CONFIG.view.height * dpr;
    canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) return;
    const source = attachInput();
    inputRef.current = source;
    return () => {
      source.detach();
      inputRef.current = null;
    };
  }, [isDesktop]);

  // Pause when the tab is hidden, so you do not come back to a corpse.
  useEffect(() => {
    const onHidden = () => {
      if (document.hidden) {
        inputRef.current?.release();
        setScreen((s) => (s === 'playing' ? 'paused' : s));
      }
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, []);

  const start = useCallback(() => {
    gameRef.current = createGame((Math.random() * 2 ** 31) >>> 0);
    // ?debug=1 exposes the live state and the raw input for poking at from the
    // console — `freedomPitInput.state` is the quickest way to tell a dead key
    // binding apart from a dead game loop.
    if (new URLSearchParams(window.location.search).has('debug')) {
      const w = window as unknown as {
        freedomPit?: unknown;
        freedomPitInput?: unknown;
        freedomPitAudio?: unknown;
      };
      w.freedomPit = gameRef;
      w.freedomPitInput = inputRef;
      w.freedomPitAudio = audioRef;
    }
    hudClock.current = 0;
    setHud(readHud(gameRef.current));
    setScreen('playing');
    containerRef.current?.focus();
    // This click is the user gesture the autoplay policy requires.
    void audioRef.current?.start();
  }, []);

  // The audio graph cannot be built before a user gesture, so it is created on
  // the click that starts the shift and torn down with the component.
  useEffect(() => {
    if (!isDesktop) return;
    const audio = new WindAudio();
    audioRef.current = audio;
    return () => {
      audio.dispose();
      audioRef.current = null;
    };
  }, [isDesktop]);

  // Polled on its own timer rather than from the game loop: a blocked context
  // most needs reporting exactly when the loop is not running.
  useEffect(() => {
    if (!isDesktop) return;
    const id = window.setInterval(() => setAudioStatus(audioRef.current?.status() ?? null), 250);
    return () => window.clearInterval(id);
  }, [isDesktop]);

  // Autoplay policies can leave the context suspended even when it was created
  // inside a click, and Safari is stricter still. Any interaction retries it.
  useEffect(() => {
    if (!isDesktop) return;
    const retry = () => void audioRef.current?.resume();
    window.addEventListener('pointerdown', retry);
    window.addEventListener('keydown', retry);
    return () => {
      window.removeEventListener('pointerdown', retry);
      window.removeEventListener('keydown', retry);
    };
  }, [isDesktop]);

  useEffect(() => {
    audioRef.current?.setMuted(muted);
    try {
      window.localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
    } catch {
      // Not being able to remember the preference is not worth failing over.
    }
  }, [muted]);

  // Silence while paused or finished; the wind belongs to the shift.
  useEffect(() => {
    if (screen === 'playing') void audioRef.current?.resume();
    else void audioRef.current?.suspend();
  }, [screen]);

  const resume = useCallback(() => {
    setScreen('playing');
    containerRef.current?.focus();
  }, []);

  const recordBest = useCallback((seconds: number) => {
    setBest((prev) => {
      if (prev !== null && prev <= seconds) return prev;
      try {
        window.localStorage.setItem(BEST_KEY, String(seconds));
      } catch {
        // Not being able to save a best time should never break the game over screen.
      }
      return seconds;
    });
  }, []);

  const onFixedStep = useCallback(
    (dt: number) => {
      const game = gameRef.current;
      const input = inputRef.current;
      if (!game || !input) return;

      step(game, input.state, dt);

      hudClock.current += dt;
      if (hudClock.current >= HUD_INTERVAL) {
        hudClock.current = 0;
        setHud(readHud(game));
        audioRef.current?.setForce(game.wind.force, game.time < game.wind.gustUntil);
      }

      if (game.phase !== 'playing') {
        setHud(readHud(game));
        if (game.phase === 'won') recordBest(game.time);
        setScreen(game.phase);
        input.release();
      }
    },
    [recordBest]
  );

  const onRender = useCallback(() => {
    // Pause is handled here rather than in the fixed step, which stops running
    // the moment we pause — reading it there would make Esc a one-way door.
    const input = inputRef.current;
    if (input?.takePauseToggle()) {
      input.release();
      setScreen((s) => (s === 'playing' ? 'paused' : s === 'paused' ? 'playing' : s));
    }

    const canvas = canvasRef.current;
    const game = gameRef.current;
    if (!canvas || !game) return;
    const ctx = canvas.getContext('2d');
    if (ctx) draw(ctx, game, { reducedMotion });
  }, [reducedMotion]);

  useGameLoop({
    step: FIXED_DT,
    running: screen === 'playing',
    onFixedStep,
    onRender,
  });

  const debug =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

  if (isDesktop === null) return <div className="min-h-[60vh]" />;
  if (!isDesktop) return <DesktopOnly />;

  const stats = gameRef.current;

  return (
    <div className="mx-auto w-full max-w-5xl px-4">
      <div
        ref={containerRef}
        tabIndex={0}
        className="relative w-full overflow-hidden rounded-sm bg-[#3d2c18] shadow-2xl outline-none ring-gold-400/60 focus-visible:ring-2"
        style={{ aspectRatio: `${CONFIG.view.width} / ${CONFIG.view.height}` }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />

        {screen === 'playing' && hud && <Hud hud={hud} />}

        {isAudioSupported() && (
          <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
            {/* Silence has several causes and they look identical from outside,
                so the state is stated rather than left to be inferred. */}
            {/* 'not-started' is normal before the first click; 'suspended'
                means it was built and then refused. */}
            {audioStatus && audioStatus.state === 'suspended' && !muted && (
              <button
                onClick={() => void audioRef.current?.start()}
                className="rounded-sm border border-gold-400 bg-gold-400/90 px-3 py-1.5 text-xs font-medium text-gray-900 transition-colors hover:bg-gold-400"
              >
                Sound blocked — click to enable
              </button>
            )}
            {debug && audioStatus && (
              <span className="rounded-sm bg-black/60 px-2 py-1 font-mono text-[10px] text-white/60">
                {audioStatus.state} gain={audioStatus.gain.toFixed(3)}
              </span>
            )}
            <button
              onClick={() => setMuted((m) => !m)}
              aria-pressed={muted}
              aria-label={muted ? 'Unmute the wind' : 'Mute the wind'}
              title={muted ? 'Unmute the wind' : 'Mute the wind'}
              className={`rounded-sm border px-2.5 py-1.5 text-sm backdrop-blur-sm transition-colors ${
                muted
                  ? 'border-red-400/70 bg-red-900/70 text-red-200'
                  : 'border-white/20 bg-black/50 text-white/70 hover:border-gold-400 hover:text-gold-400'
              }`}
            >
              {muted ? '🔇 Muted' : '🔊'}
            </button>
          </div>
        )}

        {screen === 'title' && <TitleScreen onStart={start} best={best} />}

        {screen === 'paused' && (
          <Overlay onClick={resume}>
            <h2 className="font-serif text-3xl text-white">Paused</h2>
            <p className="mt-2 text-sm text-white/60">Click the pit or press Esc to carry on.</p>
            <Button onClick={resume}>Resume</Button>
          </Overlay>
        )}

        {(screen === 'won' || screen === 'lost') && stats && (
          <Overlay>
            <h2 className="font-serif text-4xl text-white">
              {screen === 'won' ? 'Freedom' : 'GAME OVER'}
            </h2>
            <p className="mt-3 max-w-sm text-sm font-light leading-relaxed text-white/70">
              {screen === 'won'
                ? `Quota met in ${formatClock(stats.time)}. Your passport is returned, less the ${stats.stats.bribeCoins} coins it cost to keep it.`
                : `Three stings and the shift is over. You were ${Math.round(
                    (hud?.progress ?? 0) * 100
                  )}% of the way out.`}
            </p>

            <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-2 text-left text-sm">
              <Stat label="Shovelled" value={`${stats.delivered.toFixed(1)} m³`} />
              <Stat label="Blown away" value={`${stats.lostToWind.toFixed(1)} m³`} />
              <Stat label="Bribes paid" value={`${stats.stats.bribesPaid}`} />
              <Stat label="Quota added" value={`+${stats.stats.quotaAdded} m³`} />
              <Stat label="Scorpions" value={`${stats.stats.scorpionsKilled}`} />
              <Stat label="Stings taken" value={`${stats.stats.bitesTaken}`} />
            </dl>

            {screen === 'won' && best !== null && (
              <p className="mt-5 text-xs uppercase tracking-[0.2em] text-gold-400">
                Best {formatClock(best)}
              </p>
            )}
            <Button onClick={start}>{screen === 'won' ? 'Another shift' : 'Try again'}</Button>
          </Overlay>
        )}
      </div>

      <Controls />
    </div>
  );
}

// ── Chrome ───────────────────────────────────────────────────────────────────

function Overlay({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 px-8 text-center backdrop-blur-sm"
    >
      {children}
    </div>
  );
}

function Button({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="mt-7 border border-gold-400 px-7 py-2.5 text-sm font-light tracking-wide text-gold-400 transition-colors hover:bg-gold-400 hover:text-gray-900"
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-white/50">{label}</dt>
      <dd className="text-right font-mono text-white/90">{value}</dd>
    </>
  );
}

function TitleScreen({ onStart, best }: { onStart: () => void; best: number | null }) {
  return (
    <Overlay>
      <p className="mb-3 text-[10px] uppercase tracking-[0.35em] text-gold-400">A game</p>
      <h1 className="font-serif text-5xl font-medium text-white">Freedom Pit</h1>
      <p className="mt-5 max-w-md text-sm font-light leading-relaxed text-white/70">
        Fill the trench with sand until you have met your quota, and they will give you your
        passport back. The wind will take a quarter of it. The scorpions want the rest of you. The
        foremen would like a word.
      </p>
      {best !== null && (
        <p className="mt-4 text-xs uppercase tracking-[0.2em] text-white/40">
          Best {formatClock(best)}
        </p>
      )}
      <Button onClick={onStart}>Start the shift</Button>
    </Overlay>
  );
}

function Controls() {
  const keys: [string, string][] = [
    ['W A S D', 'Move'],
    ['Space', 'Dig, dump, load'],
    ['K', 'Swing the shovel'],
    ['B', 'Pay a bribe'],
    ['Esc', 'Pause'],
  ];
  return (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-xs font-light text-gray-500">
      {keys.map(([key, what]) => (
        <span key={key} className="flex items-center gap-2">
          <kbd className="rounded-sm border border-gray-300 bg-gray-50 px-2 py-0.5 font-mono text-[11px] text-gray-700">
            {key}
          </kbd>
          {what}
        </span>
      ))}
    </div>
  );
}
