import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../lib/freedom-pit/config';
import { segmentAtX, segmentCentreX, totalFill } from '../../lib/freedom-pit/pit';
import { createGame, step } from '../../lib/freedom-pit/sim';
import type { GameState, InputState, Scorpion } from '../../lib/freedom-pit/types';

// ─────────────────────────────────────────────────────────────────────────────
// Balance harness. A deliberately naive bot plays the game headlessly across
// many seeds; the printed table is what CONFIG gets tuned against, instead of
// playing the thing forty times by hand.
//
//   npm test            → 25 seeds, runs with the rest of the suite
//   npm run balance     → 200 seeds
//   SEEDS=400 npm run balance
// ─────────────────────────────────────────────────────────────────────────────

const DT = 1 / 60;
const MAX_FRAMES = 60 * 60 * 20; // give up after 20 simulated minutes
const SEEDS = Number(process.env.SEEDS ?? 25);

type Intent = 'fill' | 'dump';

function blank(): InputState {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    action: false,
    attack: false,
    bribe: false,
  };
}

function nearestScorpion(s: GameState, within: number): Scorpion | null {
  let best: Scorpion | null = null;
  let bestD = within;
  for (const sc of s.scorpions) {
    const d = Math.hypot(sc.x - s.player.x, sc.y - s.player.y);
    if (d < bestD) {
      bestD = d;
      best = sc;
    }
  }
  return best;
}

/** Emptiest segment near the player — the bot spreads its sand rather than piling. */
function bestSegment(s: GameState): number {
  const here = segmentAtX(s.player.x);
  let best = here;
  let bestFill = Infinity;
  for (let i = Math.max(0, here - 10); i <= Math.min(s.pit.length - 1, here + 10); i++) {
    if (s.pit[i] < bestFill - 1e-9) {
      bestFill = s.pit[i];
      best = i;
    }
  }
  return best;
}

function nearestLoaderPos(s: GameState): { x: number; y: number } {
  let best = s.loaders[0];
  let bestD = Infinity;
  for (const l of s.loaders) {
    const d = Math.hypot(l.x - s.player.x, l.y - s.player.y);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best;
}

function nearestMoundPos(s: GameState): { x: number; y: number } {
  let best = { x: s.player.x, y: s.player.y };
  let bestD = Infinity;
  for (const m of s.mounds) {
    const d = Math.hypot(m.x - s.player.x, m.y - s.player.y);
    if (d < bestD) {
      bestD = d;
      best = { x: m.x, y: m.y };
    }
  }
  return best;
}

function botInput(s: GameState, intent: Intent, frame: number): InputState {
  const inp = blank();
  const p = s.player;
  inp.action = true; // harmless to hold: it only does something in the right place
  inp.bribe = true; // this bot always pays

  // On foot: sidestep the telegraphed dash, then kill it while it is spent.
  // Roughly what an attentive-but-unspectacular human does.
  if (p.mode === 'shovel') {
    const threat = nearestScorpion(s, 110);
    if (threat) {
      const dx = threat.x - p.x;
      const dy = threat.y - p.y;
      const d = Math.hypot(dx, dy) || 1;

      if (threat.rear > 0 || threat.lunge > 0) {
        // Strafe across the locked-in line of the dash.
        steer(inp, p.x, p.y, p.x - (dy / d) * 80, p.y + (dx / d) * 80);
        return inp;
      }
      if (d < CONFIG.player.swingRange) {
        inp.attack = frame % 2 === 0;
        steer(inp, p.x, p.y, threat.x, threat.y); // turn to face it
        return inp;
      }
    }
  } else {
    // In the truck: pull off the loader and run it down before it climbs up.
    const threat = nearestScorpion(s, 130);
    if (threat) {
      inp.action = false;
      steer(inp, p.x, p.y, threat.x, threat.y);
      return inp;
    }
  }

  let tx: number;
  let ty: number;
  if (intent === 'dump') {
    tx = segmentCentreX(bestSegment(s));
    ty = CONFIG.world.pitTop - 25;
  } else {
    const t = p.mode === 'truck' ? nearestLoaderPos(s) : nearestMoundPos(s);
    tx = t.x;
    ty = t.y;
  }
  steer(inp, p.x, p.y, tx, ty);
  return inp;
}

function steer(inp: InputState, x: number, y: number, tx: number, ty: number): void {
  const slack = 6;
  if (tx - x > slack) inp.right = true;
  else if (x - tx > slack) inp.left = true;
  if (ty - y > slack) inp.down = true;
  else if (y - ty > slack) inp.up = true;
}

interface Run {
  won: boolean;
  /** Lost on health, as opposed to still grinding when the harness gave up. */
  died: boolean;
  progress: number;
  seconds: number;
  lostToWind: number;
  delivered: number;
  quota: number;
  bribes: number;
  bites: number;
  kills: number;
  promotedAt: number;
}

function playOneGame(seed: number): Run {
  const s = createGame(seed);
  let intent: Intent = 'fill';
  let promotedAt = 0;

  for (let f = 0; f < MAX_FRAMES && s.phase === 'playing'; f++) {
    const capacity = s.player.mode === 'truck' ? CONFIG.truck.capacity : CONFIG.player.shovelLoad;
    if (s.player.load >= capacity - 1e-6) intent = 'dump';
    else if (s.player.load <= 1e-6) intent = 'fill';

    const wasShovel = s.player.mode === 'shovel';
    step(s, botInput(s, intent, f), DT);
    if (wasShovel && s.player.mode === 'truck') promotedAt = s.time;
  }

  return {
    won: s.phase === 'won',
    died: s.phase === 'lost',
    /** How close it got — the single most useful number when the bot loses. */
    progress: totalFill(s) / s.quota,
    seconds: s.time,
    lostToWind: s.lostToWind,
    delivered: s.delivered,
    quota: s.quota,
    bribes: s.stats.bribesPaid,
    bites: s.stats.bitesTaken,
    kills: s.stats.scorpionsKilled,
    promotedAt,
  };
}

function quantile(values: number[], q: number): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[i];
}

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const mmss = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

describe('balance', () => {
  it(`a naive bot finds the game winnable but not a formality (${SEEDS} seeds)`, () => {
    const runs: Run[] = [];
    for (let seed = 1; seed <= SEEDS; seed++) runs.push(playOneGame(seed));

    const wins = runs.filter((r) => r.won);
    const winRate = wins.length / runs.length;
    const times = wins.map((r) => r.seconds);

    /* eslint-disable no-console */
    console.log(`
┌─ Freedom Pit balance ─ ${SEEDS} seeds ─────────────────────
│ win rate          ${(winRate * 100).toFixed(0)}%   (${wins.length}/${runs.length})
│ time to freedom   p10 ${mmss(quantile(times, 0.1))}  median ${mmss(
      quantile(times, 0.5)
    )}  p90 ${mmss(quantile(times, 0.9))}
│ promoted at       ${mmss(mean(runs.filter((r) => r.promotedAt > 0).map((r) => r.promotedAt)))}
│ losses got to     ${(100 * mean(runs.filter((r) => !r.won).map((r) => r.progress))).toFixed(
      0
    )}% of quota, after ${mmss(mean(runs.filter((r) => !r.won).map((r) => r.seconds)))}
│ m³ lost to wind   ${mean(runs.map((r) => r.lostToWind)).toFixed(1)}  (${(
      (100 * mean(runs.map((r) => r.lostToWind))) /
      Math.max(1, mean(runs.map((r) => r.delivered)))
    ).toFixed(0)}% of everything shovelled)
│ final quota       ${mean(runs.map((r) => r.quota)).toFixed(
      0
    )} m³  (started at ${CONFIG.quota.initial})
│ bribes paid       ${mean(runs.map((r) => r.bribes)).toFixed(1)}
│ bites taken       ${mean(runs.map((r) => r.bites)).toFixed(2)}   died ${
      runs.filter((r) => r.died).length
    }  gave up ${runs.filter((r) => !r.won && !r.died).length}
│ scorpions killed  ${mean(runs.map((r) => r.kills)).toFixed(1)}
└────────────────────────────────────────────────────────────`);
    /* eslint-enable no-console */

    // Guard rails, not targets. This bot dodges better than a human but routes
    // worse; the point is to catch a config change that guts the game, not to
    // pin exact numbers. Current shape: ~88 % wins, 7 min median.
    expect(winRate).toBeGreaterThan(0.4); // not hopeless
    expect(quantile(times, 0.5)).toBeGreaterThan(3 * 60); // not a formality
    expect(quantile(times, 0.5)).toBeLessThan(12 * 60); // not a slog

    const windLoss = mean(runs.map((r) => r.lostToWind)) / mean(runs.map((r) => r.delivered));
    expect(windLoss).toBeGreaterThan(0.1); // wind has to actually cost you
    expect(windLoss).toBeLessThan(0.45); // but never feel futile

    expect(mean(runs.map((r) => r.bites))).toBeGreaterThan(0.1); // scorpions can land hits
    expect(mean(runs.map((r) => r.quota))).toBeGreaterThan(CONFIG.quota.initial); // foremen bite
  });
});
