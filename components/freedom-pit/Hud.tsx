import { CONFIG, actionHint, freedomProgress, scorpionInRange, totalFill } from '../../lib/freedom-pit';
import type { GameState } from '../../lib/freedom-pit';

// ─────────────────────────────────────────────────────────────────────────────
// The HUD is React, refreshed roughly ten times a second from a snapshot. The
// canvas runs at 60; re-rendering this at that rate would melt the reconciler.
// ─────────────────────────────────────────────────────────────────────────────

export interface HudModel {
  progress: number;
  filled: number;
  quota: number;
  quotaAdded: number;
  health: number;
  coins: number;
  wind: number;
  gusting: boolean;
  mode: 'shovel' | 'truck';
  load: number;
  capacity: number;
  seconds: number;
  confronting: boolean;
  canAffordBribe: boolean;
  hint: string | null;
  scorpionNear: boolean;
  messages: { id: number; text: string; kind: string }[];
}

export function readHud(s: GameState): HudModel {
  return {
    progress: freedomProgress(s),
    filled: totalFill(s),
    quota: s.quota,
    quotaAdded: s.stats.quotaAdded,
    health: s.player.health,
    coins: Math.floor(s.coins),
    wind: s.wind.force,
    gusting: s.time < s.wind.gustUntil,
    mode: s.player.mode,
    load: s.player.load,
    capacity: s.player.mode === 'truck' ? CONFIG.truck.capacity : CONFIG.player.shovelLoad,
    seconds: s.time,
    confronting: s.boss?.state === 'confronting',
    canAffordBribe: s.coins >= CONFIG.boss.bribeCost,
    hint: actionHint(s),
    scorpionNear: scorpionInRange(s),
    messages: s.messages.map((m) => ({ id: m.id, text: m.text, kind: m.kind })),
  };
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function Windsock({ force, gusting }: { force: number; gusting: boolean }) {
  const bars = 5;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">Wind</span>
      <div className="flex items-end gap-[3px]">
        {Array.from({ length: bars }).map((_, i) => {
          const lit = force * bars > i;
          return (
            <div
              key={i}
              className={`w-[5px] rounded-sm transition-colors duration-150 ${
                lit ? (gusting ? 'bg-red-400' : 'bg-gold-400') : 'bg-white/15'
              }`}
              style={{ height: 5 + i * 3 }}
            />
          );
        })}
      </div>
      {gusting && (
        <span className="animate-pulse text-[10px] font-medium uppercase tracking-wider text-red-300">
          Gust
        </span>
      )}
    </div>
  );
}

export default function Hud({ hud }: { hud: HudModel }) {
  const pct = Math.round(hud.progress * 100);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 font-sans text-white">
      {/* Freedom timer — the one number that matters */}
      <div className="space-y-2">
        <div className="rounded-sm bg-black/45 px-4 py-3 backdrop-blur-sm">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-[0.28em] text-white/60">
              Freedom Timer
            </span>
            <span className="font-mono text-xs text-white/70">
              {hud.filled.toFixed(1)} / {hud.quota} m³
              {hud.quotaAdded > 0 && <span className="text-red-300"> (+{hud.quotaAdded})</span>}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-sm bg-white/15">
            <div
              className="h-full rounded-sm bg-gradient-to-r from-gold-500 to-gold-400 transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-sm bg-black/40 px-4 py-2 text-xs backdrop-blur-sm">
          <span className="flex items-center gap-1" aria-label={`${hud.health} health remaining`}>
            {Array.from({ length: CONFIG.player.maxHealth }).map((_, i) => (
              <span key={i} className={i < hud.health ? 'text-red-400' : 'text-white/20'}>
                ♥
              </span>
            ))}
          </span>
          <span className="text-white/30">|</span>
          <span className="font-mono text-gold-400">{hud.coins} coins</span>
          <span className="text-white/30">|</span>
          <Windsock force={hud.wind} gusting={hud.gusting} />
          <span className="text-white/30">|</span>
          <span className="text-white/60">
            {hud.mode === 'truck' ? 'Truck' : 'Shovel'}{' '}
            <span className="font-mono text-white/80">
              {hud.load.toFixed(hud.mode === 'truck' ? 1 : 2)} m³
            </span>
          </span>
          <span className="ml-auto font-mono text-white/50">{formatClock(hud.seconds)}</span>
        </div>
      </div>

      {/* What you can do right now. Without this, an action with a proximity
          requirement and a hold time is indistinguishable from a dead key. */}
      <div className="pointer-events-none absolute inset-x-0 top-[62%] flex justify-center">
        {hud.scorpionNear ? (
          <span className="rounded-sm bg-red-900/85 px-4 py-2 text-sm font-medium text-red-50 shadow-lg">
            Press K to swing
          </span>
        ) : (
          hud.hint && (
            <span className="rounded-sm bg-black/60 px-4 py-2 text-sm font-light text-white/90 shadow-lg backdrop-blur-sm">
              {hud.hint}
            </span>
          )
        )}
      </div>

      <div className="space-y-2">
        {hud.confronting && (
          <div
            className={`rounded-sm px-4 py-2 text-sm font-medium backdrop-blur-sm ${
              hud.canAffordBribe ? 'bg-gold-500/90 text-gray-900' : 'bg-red-900/80 text-red-100'
            }`}
          >
            {hud.canAffordBribe
              ? `Press B to pay ${CONFIG.boss.bribeCost} coins`
              : `Not enough coins — the quota is going up`}
          </div>
        )}

        {hud.messages.map((m) => (
          <div
            key={m.id}
            className={`w-fit rounded-sm bg-black/50 px-3 py-1.5 text-xs backdrop-blur-sm ${
              m.kind === 'bad'
                ? 'text-red-300'
                : m.kind === 'good'
                  ? 'text-emerald-300'
                  : 'text-white/80'
            }`}
          >
            {m.text}
          </div>
        ))}
      </div>
    </div>
  );
}
