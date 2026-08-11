import { CONFIG } from './config';
import { atPitEdge, nearestLoader, nearestMound } from './entities';
import type { GameState } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// What the player can do right now, in words.
//
// This exists because the game shipped with no way to discover that digging is
// a *held* action with a proximity requirement. Pressing Space out of range, or
// tapping it, did nothing and said nothing — indistinguishable from a dead key.
// ─────────────────────────────────────────────────────────────────────────────

export function actionHint(state: GameState): string | null {
  const p = state.player;
  if (state.phase !== 'playing' || p.stun > 0) return null;

  if (p.mode === 'truck') {
    if (p.load > 0 && atPitEdge(state)) return 'Hold SPACE to tip the load';
    if (p.load >= CONFIG.truck.capacity) return 'Full — drive to the pit';
    if (nearestLoader(state)) return 'Hold SPACE to load';
    return p.load > 0 ? 'Drive to the pit edge' : 'Drive to a hopper';
  }

  if (p.load > 0) {
    return atPitEdge(state) ? 'Press SPACE to dump' : 'Carry it to the pit edge';
  }
  if (nearestMound(state)) return 'Hold SPACE to dig';
  return 'Find a sand mound';
}

/** True while a swing would connect with something — drives the HUD cue. */
export function scorpionInRange(state: GameState): boolean {
  const p = state.player;
  if (p.mode !== 'shovel') return false;
  const reach = CONFIG.player.swingRange + CONFIG.scorpion.radius;
  return state.scorpions.some((s) => Math.hypot(s.x - p.x, s.y - p.y) <= reach);
}
