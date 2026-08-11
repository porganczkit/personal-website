import { CONFIG, WORLD_WIDTH } from './config';
import { nextFloat, range } from './rng';
import { deposit, segmentAtX } from './pit';
import { progress } from './wind';
import type { GameState, InputState, Message, MessageKind, Mound, Scorpion } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

export function say(state: GameState, text: string, kind: MessageKind = 'info'): void {
  const msg: Message = { id: state.nextId++, text, kind, ttl: 3 };
  state.messages.push(msg);
  if (state.messages.length > 4) state.messages.shift();
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Keep a circle on the walkable desert: inside the world, out of the trench. */
function keepInBounds(pos: { x: number; y: number; vy?: number }, radius: number): void {
  const { pitTop, groundTop } = CONFIG.world;
  const lip = pitTop - radius;
  if (pos.y > lip) {
    pos.y = lip;
    if (pos.vy !== undefined) pos.vy = 0;
  }
  pos.x = Math.max(radius, Math.min(WORLD_WIDTH - radius, pos.x));
  pos.y = Math.max(groundTop + radius, pos.y);
}

function inSandBand(y: number): boolean {
  return y < CONFIG.world.pitTop;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mounds — the sand supply. Exhausted mounds respawn near the player so the
// dig → carry → dump loop stays tight wherever along the pit you are working.
// ─────────────────────────────────────────────────────────────────────────────

function randomSandY(state: GameState): number {
  const [top, bottom] = CONFIG.world.sandBand;
  return range(state.rng, top, bottom);
}

export function spawnMound(state: GameState, nearX: number, minGap = 150, maxGap = 430): Mound {
  const side = nextFloat(state.rng) < 0.5 ? -1 : 1;
  const x = Math.max(
    40,
    Math.min(WORLD_WIDTH - 40, nearX + side * range(state.rng, minGap, maxGap))
  );
  return { id: state.nextId++, x, y: randomSandY(state), volume: CONFIG.mounds.volume };
}

export function nearestMound(state: GameState): Mound | null {
  let best: Mound | null = null;
  let bestD = Infinity;
  for (const m of state.mounds) {
    const d = dist(m.x, m.y, state.player.x, state.player.y);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best && bestD <= CONFIG.player.reach + CONFIG.mounds.radius ? best : null;
}

export function nearestLoader(state: GameState): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const l of state.loaders) {
    const d = dist(l.x, l.y, state.player.x, state.player.y);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best && bestD <= CONFIG.truck.loaderReach ? best : null;
}

export function atPitEdge(state: GameState): boolean {
  const p = state.player;
  const radius = p.mode === 'truck' ? CONFIG.truck.radius : CONFIG.player.radius;
  return p.y >= CONFIG.world.pitTop - (CONFIG.player.dumpReach + radius);
}

// ─────────────────────────────────────────────────────────────────────────────
// Player
// ─────────────────────────────────────────────────────────────────────────────

export function updatePlayer(state: GameState, input: InputState, dt: number): void {
  const p = state.player;
  const isTruck = p.mode === 'truck';
  const spec = isTruck ? CONFIG.truck : CONFIG.player;
  const radius = isTruck ? CONFIG.truck.radius : CONFIG.player.radius;

  p.swingCooldown = Math.max(0, p.swingCooldown - dt);
  p.swingActive = Math.max(0, p.swingActive - dt);
  p.invuln = Math.max(0, p.invuln - dt);

  if (p.swingWindup > 0) {
    p.swingWindup -= dt;
    // A sting mid-wind-up costs you the swing, which is what makes trading with
    // a lunging scorpion a real risk rather than a formality.
    if (p.stun > 0) p.swingWindup = 0;
    else if (p.swingWindup <= 0) resolveSwing(state);
  }

  if (p.health < CONFIG.player.maxHealth && p.health > 0) {
    p.recovery += dt;
    if (p.recovery >= CONFIG.player.regenAfter) {
      p.health += 1;
      p.recovery = 0;
      say(state, 'You shake it off. Heart recovered.', 'good');
    }
  }

  if (p.stun > 0) {
    p.stun -= dt;
    p.loading = false;
    p.dumping = false;
    p.climbing = 0;
    p.vx *= 0.85;
    p.vy *= 0.85;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    keepInBounds(p, radius);
    return;
  }

  // Movement — the truck shares the same directional controls but accelerates
  // far more slowly, which is what makes it feel heavy rather than awkward.
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    dx /= len;
    dy /= len;
    p.dirX = dx;
    p.dirY = dy;
  }

  const targetVx = dx * spec.speed;
  const targetVy = dy * spec.speed;
  const accel = spec.accel * dt;
  p.vx += Math.max(-accel, Math.min(accel, targetVx - p.vx));
  p.vy += Math.max(-accel, Math.min(accel, targetVy - p.vy));
  if (len === 0) {
    const decay = Math.max(0, 1 - (isTruck ? 2.2 : 9) * dt);
    p.vx *= decay;
    p.vy *= decay;
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;
  keepInBounds(p, radius);

  if (isTruck) updateTruckWork(state, input, dt);
  else updateShovelWork(state, input, dt);
  clearClimb(state);
}

function updateShovelWork(state: GameState, input: InputState, dt: number): void {
  const p = state.player;
  p.loading = false;
  p.dumping = false;

  if (!input.action) {
    p.digProgress = 0;
    return;
  }

  // Dumping takes priority: standing at the lip with a full shovel means tip it.
  if (p.load > 0 && atPitEdge(state)) {
    deposit(state, segmentAtX(p.x), p.load);
    p.load = 0;
    p.digProgress = 0;
    return;
  }

  const mound = nearestMound(state);
  if (!mound || p.load > 0 || !inSandBand(p.y)) {
    p.digProgress = 0;
    return;
  }

  p.digProgress += dt;
  if (p.digProgress >= CONFIG.player.digTime) {
    const taken = Math.min(CONFIG.player.shovelLoad, mound.volume);
    p.load = taken;
    mound.volume -= taken;
    p.digProgress = 0;
    if (mound.volume <= 1e-6) {
      const idx = state.mounds.indexOf(mound);
      state.mounds[idx] = spawnMound(state, p.x);
    }
  }
}

function updateTruckWork(state: GameState, input: InputState, dt: number): void {
  const p = state.player;
  p.loading = false;
  p.dumping = false;
  p.digProgress = 0;

  if (!input.action) return;

  if (p.load > 0 && atPitEdge(state)) {
    const amount = Math.min(p.load, CONFIG.truck.dumpRate * dt);
    const accepted = deposit(state, segmentAtX(p.x), amount);
    p.load -= accepted;
    p.dumping = true;
    return;
  }

  if (p.load < CONFIG.truck.capacity && nearestLoader(state)) {
    p.load = Math.min(CONFIG.truck.capacity, p.load + CONFIG.truck.loadRate * dt);
    p.loading = true;
  }
}

/** Anything that stops you loading also shakes off whatever was climbing up. */
function clearClimb(state: GameState): void {
  if (!state.player.loading) state.player.climbing = 0;
}

/** Start a swing. It connects `swingWindup` seconds later, in resolveSwing. */
export function trySwing(state: GameState): void {
  const p = state.player;
  if (p.mode !== 'shovel' || p.stun > 0 || p.swingCooldown > 0) return;

  p.swingCooldown = CONFIG.player.swingCooldown;
  p.swingActive = CONFIG.player.swingDuration;
  p.swingWindup = CONFIG.player.swingWindup;
}

/** The shovel lands: everything inside the arc, at this instant, dies. */
export function resolveSwing(state: GameState): void {
  const p = state.player;
  const { swingRange, swingHalfAngle } = CONFIG.player;
  const facing = Math.atan2(p.dirY, p.dirX);
  state.scorpions = state.scorpions.filter((s) => {
    const dx = s.x - p.x;
    const dy = s.y - p.y;
    if (Math.hypot(dx, dy) > swingRange + CONFIG.scorpion.radius) return true;
    let delta = Math.atan2(dy, dx) - facing;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    if (Math.abs(delta) > swingHalfAngle) return true;

    state.coins += CONFIG.scorpion.bounty;
    state.stats.scorpionsKilled += 1;
    return false;
  });
}

function bite(state: GameState): void {
  const p = state.player;
  if (p.invuln > 0) return;
  p.health -= 1;
  p.stun = CONFIG.player.stunTime;
  p.invuln = CONFIG.player.invulnTime;
  p.recovery = 0;
  // A shovel spills; a loaded tray does not. The truck's penalty is the lost
  // loading time, applied by the caller.
  if (p.mode === 'shovel') p.load = 0;
  state.stats.bitesTaken += 1;
  say(state, p.health > 0 ? 'Scorpion sting! Load dropped.' : 'Down. That is the shift over.', 'bad');
}

// ─────────────────────────────────────────────────────────────────────────────
// Scorpions
// ─────────────────────────────────────────────────────────────────────────────

export function newScorpion(id: number, x: number, y: number, wobble = 0): Scorpion {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    wobble,
    rear: 0,
    lunge: 0,
    lungeX: 0,
    lungeY: 0,
    lungeCooldown: 0,
  };
}

function spawnScorpion(state: GameState): Scorpion {
  const side = nextFloat(state.rng) < 0.5 ? -1 : 1;
  const x = Math.max(
    20,
    Math.min(WORLD_WIDTH - 20, state.player.x + side * (CONFIG.view.width / 2 + 40))
  );
  return newScorpion(state.nextId++, x, randomSandY(state), range(state.rng, 0, Math.PI * 2));
}

export function updateScorpions(state: GameState, dt: number): void {
  const cfg = CONFIG.scorpion;
  const p = state.player;
  const ramp = 1 - (1 - cfg.lateGameScale) * progress(state);

  if (state.time >= state.nextScorpionAt) {
    state.nextScorpionAt = state.time + cfg.spawnEvery * ramp;
    if (state.scorpions.length < cfg.maxAlive) state.scorpions.push(spawnScorpion(state));
  }

  const playerRadius = p.mode === 'truck' ? CONFIG.truck.radius : CONFIG.player.radius;
  const speed = Math.hypot(p.vx, p.vy);
  const survivors: Scorpion[] = [];

  for (const s of state.scorpions) {
    s.wobble += dt * 3;
    s.lungeCooldown = Math.max(0, s.lungeCooldown - dt);
    const dx = p.x - s.x;
    const dy = p.y - s.y;
    const d = Math.hypot(dx, dy) || 1;

    if (s.lunge > 0) {
      // Committed to a straight dash — this is the window to sidestep.
      s.lunge -= dt;
      s.vx = s.lungeX * cfg.lungeSpeed;
      s.vy = s.lungeY * cfg.lungeSpeed;
    } else if (s.rear > 0) {
      // Reared up and aiming. Stationary, telegraphed, and easy to kill.
      s.rear -= dt;
      s.vx = 0;
      s.vy = 0;
      if (s.rear <= 0) {
        s.lunge = cfg.lungeTime;
        s.lungeCooldown = cfg.lungeTime + cfg.lungeRecover;
      }
    } else if (d < cfg.lungeRange && s.lungeCooldown <= 0) {
      s.rear = cfg.rearTime;
      s.lungeX = dx / d; // aim locks here, so moving after this dodges it
      s.lungeY = dy / d;
      s.vx = 0;
      s.vy = 0;
    } else {
      // Stalk, but skitter — a straight line would be trivial to shovel. Slow
      // and vulnerable while recovering from a lunge.
      const spent = s.lungeCooldown > 0 ? cfg.recoverySpeed : 1;
      const speed = cfg.speed * spent;
      const jitter = Math.sin(s.wobble) * cfg.jitter;
      s.vx = (dx / d) * speed - (dy / d) * jitter * speed * 0.35;
      s.vy = (dy / d) * speed + (dx / d) * jitter * speed * 0.35;
    }

    s.x += s.vx * dt;
    s.y += s.vy * dt;
    keepInBounds(s, cfg.radius);

    const touching = Math.hypot(p.x - s.x, p.y - s.y) < playerRadius + cfg.radius;
    if (touching) {
      if (p.mode === 'truck') {
        if (speed >= CONFIG.truck.crushSpeed) {
          state.coins += cfg.bounty;
          state.stats.scorpionsKilled += 1;
          continue;
        }
        // In the cab you are untouchable, until you park at a loader — then it
        // climbs. Pull away in time and it falls off; the load is the cost.
        if (p.loading) {
          p.climbing += dt;
          if (p.climbing >= CONFIG.truck.climbTime) {
            p.climbing = 0;
            p.load = Math.max(0, p.load - CONFIG.truck.capacity * 0.3);
            bite(state);
          }
        }
      } else {
        bite(state);
      }
    }
    survivors.push(s);
  }

  state.scorpions = survivors;
}

// ─────────────────────────────────────────────────────────────────────────────
// The foreman
// ─────────────────────────────────────────────────────────────────────────────

export function updateBoss(state: GameState, input: InputState, dt: number): void {
  const cfg = CONFIG.boss;
  const p = state.player;

  if (!state.boss && state.time >= state.nextBossAt) {
    const side = nextFloat(state.rng) < 0.5 ? -1 : 1;
    state.boss = {
      id: state.nextId++,
      x: Math.max(20, Math.min(WORLD_WIDTH - 20, p.x + side * (CONFIG.view.width / 2 + 60))),
      y: randomSandY(state),
      state: 'approaching',
      pursuit: 0,
      decision: 0,
    };
    say(state, 'A foreman is heading your way.', 'info');
  }

  const boss = state.boss;
  if (!boss) return;

  if (boss.state === 'leaving') {
    boss.x += (boss.x < p.x ? -1 : 1) * cfg.walkSpeed * dt;
    boss.decision -= dt;
    if (boss.decision <= 0) {
      state.boss = null;
      state.nextBossAt = state.time + range(state.rng, cfg.arriveEvery[0], cfg.arriveEvery[1]);
    }
    return;
  }

  if (boss.state === 'approaching') {
    boss.pursuit += dt;
    const speed = Math.min(cfg.maxSpeed, cfg.walkSpeed + cfg.speedRamp * boss.pursuit);
    const dx = p.x - boss.x;
    const dy = p.y - boss.y;
    const d = Math.hypot(dx, dy) || 1;
    boss.x += (dx / d) * speed * dt;
    boss.y += (dy / d) * speed * dt;
    keepInBounds(boss, cfg.radius);

    if (d < cfg.contactRadius) {
      boss.state = 'confronting';
      boss.decision = cfg.decisionTime;
      say(state, `"Quota looks light." Press B to pay ${cfg.bribeCost} coins.`, 'info');
    }
    return;
  }

  // Confronting — no escaping now; pay or take the penalty.
  boss.decision -= dt;
  if (input.bribe && state.coins >= cfg.bribeCost) {
    state.coins -= cfg.bribeCost;
    state.stats.bribesPaid += 1;
    state.stats.bribeCoins += cfg.bribeCost;
    say(state, 'Bribe paid. He saw nothing.', 'good');
    boss.state = 'leaving';
    boss.decision = 2.5;
    return;
  }
  if (boss.decision <= 0) {
    state.quota += CONFIG.quota.bossPenalty;
    state.stats.quotaAdded += CONFIG.quota.bossPenalty;
    say(state, `Quota raised by ${CONFIG.quota.bossPenalty} m³.`, 'bad');
    boss.state = 'leaving';
    boss.decision = 2.5;
  }
}
