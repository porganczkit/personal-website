import { CONFIG, WORLD_WIDTH } from './config';
import { createRng } from './rng';
import { erode, totalFill } from './pit';
import { createWind, updateWind } from './wind';
import { say, spawnMound, trySwing, updateBoss, updatePlayer, updateScorpions } from './entities';
import type { GameState, InputState, Loader } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The whole game: step(state, input, dt). No DOM, no Date, no Math.random —
// which is what lets the unit tests and the balance harness run headless.
//
// State is mutated in place and returned, rather than copied: at 60 Hz with a
// few hundred entities, immutable copies would be pure GC churn. Determinism
// comes from the seeded RNG, not from immutability.
// ─────────────────────────────────────────────────────────────────────────────

export const FIXED_DT = 1 / 60;

function createLoaders(): Loader[] {
  const loaders: Loader[] = [];
  const spacing = 900;
  for (let x = spacing / 2; x < WORLD_WIDTH; x += spacing) {
    // Alternate front and back of the desert band so the drive is never uniform.
    loaders.push({ x, y: loaders.length % 2 === 0 ? 120 : 300 });
  }
  return loaders;
}

export function createGame(seed = 1): GameState {
  const segments = CONFIG.world.segments;
  const startX = WORLD_WIDTH / 2;

  const state: GameState = {
    seed,
    rng: createRng(seed),
    time: 0,
    phase: 'playing',

    pit: new Array(segments).fill(0),
    shelter: new Array(segments).fill(0),

    quota: CONFIG.quota.initial,
    delivered: 0,
    lostToWind: 0,
    coins: 0,

    player: {
      x: startX,
      y: CONFIG.world.pitTop - 120,
      vx: 0,
      vy: 0,
      dirX: 1,
      dirY: 0,
      mode: 'shovel',
      load: 0,
      digProgress: 0,
      loading: false,
      dumping: false,
      climbing: 0,
      health: CONFIG.player.maxHealth,
      stun: 0,
      invuln: 0,
      recovery: 0,
      swingCooldown: 0,
      swingActive: 0,
      swingWindup: 0,
    },

    mounds: [],
    scorpions: [],
    loaders: createLoaders(),
    boss: null,
    wind: createWind(),

    nextBossAt: CONFIG.boss.arriveEvery[0],
    nextScorpionAt: CONFIG.scorpion.spawnEvery,
    promoted: false,
    prevAttack: false,

    messages: [],
    nextId: 1,

    stats: {
      bribesPaid: 0,
      bribeCoins: 0,
      quotaAdded: 0,
      scorpionsKilled: 0,
      bitesTaken: 0,
    },
  };

  for (let i = 0; i < CONFIG.mounds.count; i++) {
    state.mounds.push(spawnMound(state, startX, 120, 620));
  }

  return state;
}

export function step(state: GameState, input: InputState, dt: number): GameState {
  if (state.phase !== 'playing') return state;

  state.time += dt;

  updateWind(state, dt);
  erode(state, dt);

  updatePlayer(state, input, dt);
  if (input.attack && !state.prevAttack) trySwing(state);
  state.prevAttack = input.attack;

  updateScorpions(state, dt);
  updateBoss(state, input, dt);

  for (let i = state.messages.length - 1; i >= 0; i--) {
    state.messages[i].ttl -= dt;
    if (state.messages[i].ttl <= 0) state.messages.splice(i, 1);
  }

  const filled = totalFill(state);

  if (!state.promoted && filled >= state.quota * CONFIG.truck.unlockAt) {
    state.promoted = true;
    state.player.mode = 'truck';
    state.player.load = 0;
    state.player.digProgress = 0;
    say(state, 'Promoted. The truck is yours — load at the hoppers.', 'good');
  }

  if (state.player.health <= 0) state.phase = 'lost';
  else if (filled >= state.quota) state.phase = 'won';

  return state;
}

/** 0 → 1. What the Freedom Timer displays. */
export function freedomProgress(state: GameState): number {
  return Math.max(0, Math.min(1, totalFill(state) / state.quota));
}
