import { CONFIG } from './config';
import type { GameState } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The pit is a row of segments, each holding a volume of sand. Not per-pixel
// physics — this keeps the whole thing testable and the wind model honest.
// ─────────────────────────────────────────────────────────────────────────────

export function totalFill(state: GameState): number {
  let sum = 0;
  for (let i = 0; i < state.pit.length; i++) sum += state.pit[i];
  return sum;
}

export function segmentAtX(x: number): number {
  const i = Math.floor(x / CONFIG.world.segmentWidth);
  return Math.max(0, Math.min(CONFIG.world.segments - 1, i));
}

export function segmentCentreX(index: number): number {
  return (index + 0.5) * CONFIG.world.segmentWidth;
}

/**
 * Tip `amount` m³ into segment `index`, spilling outward to the nearest
 * segments that still have room. Returns how much was actually accepted, which
 * is less than `amount` only when the whole pit is full.
 */
export function deposit(state: GameState, index: number, amount: number): number {
  const cap = CONFIG.pit.capacity;
  let remaining = amount;
  const n = state.pit.length;

  for (let spread = 0; spread < n && remaining > 1e-9; spread++) {
    // Alternate outward from the target: 0, -1, +1, -2, +2, …
    for (const i of spread === 0 ? [index] : [index - spread, index + spread]) {
      if (i < 0 || i >= n || remaining <= 1e-9) continue;
      const room = cap - state.pit[i];
      if (room <= 1e-9) continue;
      const put = Math.min(room, remaining);
      state.pit[i] += put;
      state.shelter[i] = CONFIG.pit.shelterTime;
      remaining -= put;
    }
  }

  const accepted = amount - remaining;
  state.delivered += accepted;
  state.coins += accepted * CONFIG.economy.coinsPerCubicMetre;
  return accepted;
}

/** Blow sand out of the pit. Fuller segments are more exposed, so they go first. */
export function erode(state: GameState, dt: number): number {
  const { erosionRate } = CONFIG.wind;
  const cap = CONFIG.pit.capacity;
  const force = state.wind.force;
  const perFull = erosionRate * force * force * dt;
  if (perFull <= 0) return 0;

  let lost = 0;
  for (let i = 0; i < state.pit.length; i++) {
    if (state.shelter[i] > 0) {
      state.shelter[i] = Math.max(0, state.shelter[i] - dt);
      continue;
    }
    const fill = state.pit[i];
    if (fill <= 0) continue;
    const loss = Math.min(fill, perFull * (fill / cap));
    state.pit[i] = fill - loss;
    lost += loss;
  }
  state.lostToWind += lost;
  return lost;
}
