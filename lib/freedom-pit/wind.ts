import { CONFIG } from './config';
import { gaussian, nextFloat, range } from './rng';
import type { GameState, Wind } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Wind is an Ornstein–Uhlenbeck process: it drifts and mean-reverts rather than
// flickering, so the player can read it. Gusts temporarily raise the target,
// and are always telegraphed (the HUD sock swings before the sand starts to go).
// ─────────────────────────────────────────────────────────────────────────────

export function createWind(): Wind {
  return {
    force: CONFIG.wind.baseTarget,
    target: CONFIG.wind.baseTarget,
    dir: 1,
    gustUntil: 0,
    nextGustAt: CONFIG.wind.gustEvery[0],
  };
}

/** 0 → 1 as the pit fills. Late game gets windier and more volatile. */
export function progress(state: GameState): number {
  let sum = 0;
  for (let i = 0; i < state.pit.length; i++) sum += state.pit[i];
  return Math.max(0, Math.min(1, sum / state.quota));
}

export function updateWind(state: GameState, dt: number): void {
  const w = state.wind;
  const cfg = CONFIG.wind;
  const ramp = 1 + (cfg.lateGameScale - 1) * progress(state);

  if (state.time >= w.nextGustAt) {
    const duration = range(state.rng, cfg.gustDuration[0], cfg.gustDuration[1]);
    w.gustUntil = state.time + duration;
    w.nextGustAt =
      state.time + duration + range(state.rng, cfg.gustEvery[0], cfg.gustEvery[1]) / ramp;
    w.dir = nextFloat(state.rng) < 0.5 ? -1 : 1;
  }

  w.target = state.time < w.gustUntil ? cfg.gustTarget : cfg.baseTarget * ramp;

  // dW = θ(µ − W)dt + σ√dt · N(0,1)
  const drift = cfg.meanReversion * (w.target - w.force) * dt;
  const shock = cfg.volatility * ramp * Math.sqrt(dt) * gaussian(state.rng);
  w.force = Math.max(0, Math.min(1, w.force + drift + shock));
}

export function isGusting(state: GameState): boolean {
  return state.time < state.wind.gustUntil;
}
