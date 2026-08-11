import type { Rng } from './rng';

export type Mode = 'shovel' | 'truck';
export type Phase = 'playing' | 'won' | 'lost';
export type MessageKind = 'info' | 'good' | 'bad';

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Context-sensitive: dig at a mound / load at a loader / dump at the pit. */
  action: boolean;
  /** Shovel swing. */
  attack: boolean;
  /** Pay off the foreman. */
  bribe: boolean;
}

export const NO_INPUT: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  action: false,
  attack: false,
  bribe: false,
};

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Last non-zero movement direction, used for the swing arc and sprites. */
  dirX: number;
  dirY: number;
  mode: Mode;
  load: number;
  digProgress: number;
  /** True while parked at a loader with the action key held (truck only). */
  loading: boolean;
  dumping: boolean;
  /** Seconds a scorpion has spent climbing to the cab. Resets when you move. */
  climbing: number;
  health: number;
  stun: number;
  invuln: number;
  /** Seconds since the last sting, counting toward the next heart back. */
  recovery: number;
  swingCooldown: number;
  swingActive: number;
  /** Counts down to the moment the shovel actually connects. */
  swingWindup: number;
}

export interface Mound {
  id: number;
  x: number;
  y: number;
  volume: number;
}

export interface Scorpion {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  wobble: number;
  /** Seconds left rearing up before the dash — the telegraph, and your window. */
  rear: number;
  /** Seconds left in the current lunge; 0 when it is stalking normally. */
  lunge: number;
  /** Direction the lunge committed to, so it can be sidestepped. */
  lungeX: number;
  lungeY: number;
  /** Cooldown covering the lunge and the sluggish recovery after it. */
  lungeCooldown: number;
}

export type BossState = 'approaching' | 'confronting' | 'leaving';

export interface Boss {
  id: number;
  x: number;
  y: number;
  state: BossState;
  /** Seconds spent pursuing, which is what makes him speed up. */
  pursuit: number;
  /** Countdown while confronting. */
  decision: number;
}

export interface Wind {
  force: number;
  target: number;
  /** -1 blows sand left, +1 right. Cosmetic, but it drives the streaks. */
  dir: number;
  gustUntil: number;
  nextGustAt: number;
}

export interface Message {
  id: number;
  text: string;
  kind: MessageKind;
  ttl: number;
}

export interface Loader {
  x: number;
  y: number;
}

export interface GameState {
  seed: number;
  rng: Rng;
  time: number;
  phase: Phase;

  /** Sand currently sitting in each segment, in m³. Wind takes from these. */
  pit: number[];
  /** Per-segment erosion immunity, in seconds. Set when you top a segment up. */
  shelter: number[];

  quota: number;
  /** Cumulative m³ shovelled in — drives coins, and can exceed the quota. */
  delivered: number;
  lostToWind: number;
  coins: number;

  player: Player;
  mounds: Mound[];
  scorpions: Scorpion[];
  loaders: Loader[];
  boss: Boss | null;
  wind: Wind;

  nextBossAt: number;
  nextScorpionAt: number;
  promoted: boolean;
  /** Rising-edge detection for the swing, kept in state so replays are exact. */
  prevAttack: boolean;

  messages: Message[];
  nextId: number;

  stats: {
    bribesPaid: number;
    bribeCoins: number;
    quotaAdded: number;
    scorpionsKilled: number;
    bitesTaken: number;
  };
}
