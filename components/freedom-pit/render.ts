import { CONFIG, WORLD_WIDTH } from '../../lib/freedom-pit';
import type { GameState, Scorpion } from '../../lib/freedom-pit';

// ─────────────────────────────────────────────────────────────────────────────
// All drawing. Reads state, never mutates it. Everything is drawn from shapes —
// no sprite sheets to load, and it keeps the page self-contained.
// ─────────────────────────────────────────────────────────────────────────────

const SAND = '#e0c893';
const SAND_DARK = '#c9ad78';
const FAR_BANK = '#b99f70';
const TRENCH_EMPTY = '#3d2c18';
const TRENCH_FULL = '#d8bd87';
const CHARCOAL = '#2f2a24';
const GOLD = '#d4a853';

const { pitTop, pitBottom, groundTop, segmentWidth } = CONFIG.world;

/** Cheap stable hash → [0,1). Used for scenery that must not flicker. */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function lerpColour(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.substr(i, 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.substr(i, 2), 16));
  const mix = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
}

// ── Ground ───────────────────────────────────────────────────────────────────

let groundTile: HTMLCanvasElement | null = null;

function getGroundTile(): HTMLCanvasElement {
  if (groundTile) return groundTile;
  const size = 256;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const g = tile.getContext('2d')!;

  g.fillStyle = SAND;
  g.fillRect(0, 0, size, size);

  // Speckle and a few pebbles, so scrolling reads as movement over ground.
  for (let i = 0; i < 900; i++) {
    const x = hash01(i * 3.1) * size;
    const y = hash01(i * 7.7 + 11) * size;
    const r = 0.5 + hash01(i * 2.3) * 1.6;
    g.fillStyle = hash01(i) > 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(120,92,52,0.16)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 26; i++) {
    const x = hash01(i * 13.3 + 3) * size;
    const y = hash01(i * 5.9 + 29) * size;
    g.fillStyle = 'rgba(105,82,48,0.30)';
    g.beginPath();
    g.ellipse(x, y, 2.4, 1.7, hash01(i) * 3, 0, Math.PI * 2);
    g.fill();
  }

  groundTile = tile;
  return tile;
}

// ── The trench ───────────────────────────────────────────────────────────────

function drawPit(ctx: CanvasRenderingContext2D, state: GameState, camX: number, w: number): void {
  const first = Math.max(0, Math.floor(camX / segmentWidth) - 1);
  const last = Math.min(state.pit.length - 1, Math.ceil((camX + w) / segmentWidth) + 1);
  const depth = pitBottom - pitTop;

  for (let i = first; i <= last; i++) {
    const x = i * segmentWidth - camX;
    const ratio = Math.max(0, Math.min(1, state.pit[i] / CONFIG.pit.capacity));

    ctx.fillStyle = lerpColour(TRENCH_EMPTY, TRENCH_FULL, ratio);
    ctx.fillRect(x, pitTop, segmentWidth + 1, depth);

    // Sand heaped against the near wall: the visible measure of your work.
    if (ratio > 0.02) {
      const h = depth * ratio;
      const grad = ctx.createLinearGradient(0, pitBottom - h, 0, pitBottom);
      grad.addColorStop(0, 'rgba(240,222,180,0.55)');
      grad.addColorStop(1, 'rgba(214,188,136,0.95)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, pitBottom - h, segmentWidth + 1, h);
    }

    // Shadow under the near lip, deep when empty and shallow when full.
    const shadow = ctx.createLinearGradient(0, pitTop, 0, pitTop + 46);
    shadow.addColorStop(0, `rgba(0,0,0,${0.62 * (1 - ratio * 0.85)})`);
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(x, pitTop, segmentWidth + 1, 46);

    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.fillRect(x, pitTop, 1, depth);
  }

  // Near lip and far bank.
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(0, pitTop - 2, w, 2);
  ctx.fillStyle = FAR_BANK;
  ctx.fillRect(0, pitBottom, w, CONFIG.world.height - pitBottom);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, pitBottom, w, 4);
}

// ── Props ────────────────────────────────────────────────────────────────────

function drawMound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  volume: number,
  inRange: boolean
): void {
  const scale = 0.45 + 0.55 * Math.min(1, volume / CONFIG.mounds.volume);
  const r = CONFIG.mounds.radius * scale;

  // Being fractionally out of reach used to be silent. Now the mound tells you.
  if (inRange) {
    ctx.strokeStyle = 'rgba(212,168,83,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.ellipse(x, y, r + 8, r * 0.72 + 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 5, r, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.15, x, y, r);
  grad.addColorStop(0, '#f3e2ba');
  grad.addColorStop(1, SAND_DARK);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawLoader(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.fillRect(x - 30, y - 16, 64, 40);

  ctx.fillStyle = '#6b6058';
  ctx.fillRect(x - 32, y - 20, 64, 40);
  ctx.fillStyle = '#8a7d70';
  ctx.fillRect(x - 32, y - 20, 64, 8);
  ctx.fillStyle = GOLD;
  ctx.fillRect(x - 32, y + 12, 64, 4);

  // Sand in the hopper mouth.
  ctx.fillStyle = SAND;
  ctx.beginPath();
  ctx.moveTo(x - 18, y - 8);
  ctx.lineTo(x + 18, y - 8);
  ctx.lineTo(x, y + 12);
  ctx.closePath();
  ctx.fill();
}

// ── Actors ───────────────────────────────────────────────────────────────────

function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + r * 0.55, r * 0.95, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawWorker(ctx: CanvasRenderingContext2D, state: GameState, x: number, y: number): void {
  const p = state.player;
  const r = CONFIG.player.radius;
  drawShadow(ctx, x, y, r);

  // Flash while briefly invulnerable after a sting.
  if (p.invuln > 0 && Math.floor(state.time * 12) % 2 === 0) ctx.globalAlpha = 0.45;

  const angle = Math.atan2(p.dirY, p.dirX);

  // The swept arc, drawn on every swing whether or not it connects — a miss
  // has to look like a miss, not like a key that did nothing.
  const swung = p.swingActive > 0;
  if (swung) {
    const t = 1 - p.swingActive / CONFIG.player.swingDuration;
    ctx.fillStyle = `rgba(255,240,205,${0.35 * (1 - t)})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(
      x,
      y,
      CONFIG.player.swingRange,
      angle - CONFIG.player.swingHalfAngle,
      angle + CONFIG.player.swingHalfAngle
    );
    ctx.closePath();
    ctx.fill();
  }

  // Shovel: swings through an arc as the blow lands.
  const t = swung ? 1 - p.swingActive / CONFIG.player.swingDuration : 0;
  const shovelAngle = angle + (swung ? -0.9 + t * 1.8 : 0.45);
  const sx = x + Math.cos(shovelAngle) * (r + 16);
  const sy = y + Math.sin(shovelAngle) * (r + 16);
  ctx.strokeStyle = '#8a6a3f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(sx, sy);
  ctx.stroke();
  ctx.fillStyle = '#b8b2a8';
  ctx.beginPath();
  ctx.ellipse(sx, sy, 7, 5, shovelAngle, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = CHARCOAL;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Hard hat, offset the way he is facing so you can read his heading.
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(x + Math.cos(angle) * 3, y + Math.sin(angle) * 3 - 2, r * 0.62, 0, Math.PI * 2);
  ctx.fill();

  // A shovel-load riding on his back.
  if (p.load > 0) {
    ctx.fillStyle = SAND;
    ctx.beginPath();
    ctx.arc(x - Math.cos(angle) * 8, y - Math.sin(angle) * 8, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dig progress. Holding Space for four tenths of a second used to produce no
  // feedback whatsoever, which read as the key being dead.
  if (p.digProgress > 0) {
    const t = Math.min(1, p.digProgress / CONFIG.player.digTime);
    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y - 26, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = GOLD;
    ctx.beginPath();
    ctx.arc(x, y - 26, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawTruck(ctx: CanvasRenderingContext2D, state: GameState, x: number, y: number): void {
  const p = state.player;
  const angle = Math.atan2(p.dirY, p.dirX);
  drawShadow(ctx, x, y, CONFIG.truck.radius);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.fillStyle = '#3a352e';
  ctx.fillRect(-24, -18, 12, 6);
  ctx.fillRect(-24, 12, 12, 6);
  ctx.fillRect(10, -18, 12, 6);
  ctx.fillRect(10, 12, 12, 6);

  ctx.fillStyle = GOLD;
  ctx.fillRect(-26, -15, 52, 30);
  ctx.fillStyle = '#a8792b';
  ctx.fillRect(-26, -15, 18, 30); // tray

  // Load riding in the tray.
  if (p.load > 0) {
    const fill = p.load / CONFIG.truck.capacity;
    ctx.fillStyle = SAND;
    ctx.fillRect(-24, -13 + 26 * (1 - fill), 14, 26 * fill);
  }

  ctx.fillStyle = '#2b2620';
  ctx.fillRect(8, -11, 14, 22); // cab
  ctx.fillStyle = '#7fb0c8';
  ctx.fillRect(16, -8, 5, 16); // windscreen
  ctx.restore();

  if (p.invuln > 0 && Math.floor(state.time * 12) % 2 === 0) {
    ctx.fillStyle = 'rgba(220,60,40,0.25)';
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawScorpion(ctx: CanvasRenderingContext2D, s: Scorpion, x: number, y: number): void {
  const rearing = s.rear > 0;
  const angle = Math.atan2(s.vy || s.lungeY, s.vx || s.lungeX);
  drawShadow(ctx, x, y, CONFIG.scorpion.radius);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rearing ? Math.atan2(s.lungeY, s.lungeX) : angle);
  if (rearing) ctx.scale(1.25, 1.25); // reared up and about to go

  ctx.fillStyle = rearing ? '#6b2418' : '#40301c';
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = rearing ? '#8c3020' : '#40301c';
  ctx.lineWidth = 2.4;
  ctx.beginPath(); // tail, curling back over the body
  ctx.moveTo(-8, 0);
  ctx.quadraticCurveTo(-18, -3, -15, -11);
  ctx.stroke();
  ctx.fillStyle = rearing ? '#c4472f' : '#5a4426';
  ctx.beginPath();
  ctx.arc(-15, -12, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(7, side * 3);
    ctx.lineTo(14, side * 7);
    ctx.stroke();
  }
  ctx.restore();

  if (rearing) {
    ctx.strokeStyle = 'rgba(220,70,45,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 18 + Math.sin(s.rear * 30) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBoss(ctx: CanvasRenderingContext2D, state: GameState, x: number, y: number): void {
  const boss = state.boss!;
  drawShadow(ctx, x, y, CONFIG.boss.radius);

  ctx.fillStyle = '#f2ece0'; // thobe
  ctx.beginPath();
  ctx.moveTo(x, y - 14);
  ctx.lineTo(x + 13, y + 16);
  ctx.lineTo(x - 13, y + 16);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#e8e0d0';
  ctx.beginPath();
  ctx.arc(x, y - 16, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a352e';
  ctx.fillRect(x - 9, y - 20, 18, 4); // agal

  if (boss.state === 'confronting') {
    const t = 1 - boss.decision / CONFIG.boss.decisionTime;
    ctx.strokeStyle = 'rgba(200,50,40,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y - 34, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - t));
    ctx.stroke();
    ctx.fillStyle = '#c8322a';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', x, y - 28);
  } else if (boss.state === 'approaching') {
    ctx.fillStyle = 'rgba(200,50,40,0.85)';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', x, y - 26);
  }
}

// ── Weather ──────────────────────────────────────────────────────────────────

function drawWind(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camX: number,
  w: number,
  h: number
): void {
  const force = state.wind.force;
  if (force < 0.12) return;

  const count = Math.floor(30 + force * 130);
  const speed = 260 + force * 900;
  ctx.strokeStyle = `rgba(255,247,228,${0.10 + force * 0.35})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const span = w + 300;
    const drift = state.time * speed * state.wind.dir + hash01(i) * span * 4;
    const x = ((((drift % span) + span) % span) - 150) + hash01(i * 2.7) * 40 - (camX % 200);
    const y = hash01(i * 5.3 + 7) * h;
    const len = (10 + force * 46) * state.wind.dir;
    ctx.moveTo(x, y);
    ctx.lineTo(x - len, y + Math.sin(i) * 2);
  }
  ctx.stroke();
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function draw(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  opts: { reducedMotion?: boolean } = {}
): void {
  const w = CONFIG.view.width;
  const h = CONFIG.view.height;
  const p = state.player;

  const camX = Math.max(0, Math.min(WORLD_WIDTH - w, p.x - w / 2));

  ctx.save();
  // A knock from a sting shakes the frame, unless the visitor asked us not to.
  if (!opts.reducedMotion && p.stun > 0) {
    const k = p.stun / CONFIG.player.stunTime;
    ctx.translate(Math.sin(state.time * 60) * 5 * k, Math.cos(state.time * 47) * 4 * k);
  }

  const tile = getGroundTile();
  const pattern = ctx.createPattern(tile, 'repeat')!;
  ctx.save();
  ctx.translate(-camX % 256, 0);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w + 256, h);
  ctx.restore();

  // Out-of-bounds haze at the top of the map.
  const haze = ctx.createLinearGradient(0, 0, 0, groundTop + 30);
  haze.addColorStop(0, 'rgba(198,176,132,0.95)');
  haze.addColorStop(1, 'rgba(198,176,132,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, w, groundTop + 30);

  drawPit(ctx, state, camX, w);

  for (const l of state.loaders) {
    if (l.x < camX - 80 || l.x > camX + w + 80) continue;
    drawLoader(ctx, l.x - camX, l.y);
  }
  const digReach = CONFIG.player.reach + CONFIG.mounds.radius;
  for (const m of state.mounds) {
    if (m.x < camX - 60 || m.x > camX + w + 60) continue;
    const inRange =
      p.mode === 'shovel' && p.load === 0 && Math.hypot(m.x - p.x, m.y - p.y) <= digReach;
    drawMound(ctx, m.x - camX, m.y, m.volume, inRange);
  }

  // Painter's algorithm, so things nearer the bottom overlap what is behind.
  const actors: { y: number; render: () => void }[] = [];
  for (const s of state.scorpions) {
    if (s.x < camX - 40 || s.x > camX + w + 40) continue;
    actors.push({ y: s.y, render: () => drawScorpion(ctx, s, s.x - camX, s.y) });
  }
  if (state.boss) {
    const b = state.boss;
    actors.push({ y: b.y, render: () => drawBoss(ctx, state, b.x - camX, b.y) });
  }
  actors.push({
    y: p.y,
    render: () =>
      p.mode === 'truck'
        ? drawTruck(ctx, state, p.x - camX, p.y)
        : drawWorker(ctx, state, p.x - camX, p.y),
  });
  actors.sort((a, b) => a.y - b.y);
  for (const a of actors) a.render();

  // Something is on the cab and about to reach you. Drawn loudly: this is the
  // only moment in the truck when you are vulnerable at all.
  if (p.climbing > 0) {
    const t = p.climbing / CONFIG.truck.climbTime;
    const cx = p.x - camX;
    ctx.strokeStyle = 'rgba(220,60,40,0.25)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, p.y, 38, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(235,70,45,${0.65 + t * 0.35})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, p.y, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
    ctx.stroke();

    if (!opts.reducedMotion && Math.floor(state.time * 8) % 2 === 0) {
      ctx.fillStyle = 'rgba(235,70,45,0.9)';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DRIVE OFF', cx, p.y - 48);
    }
  }

  if (!opts.reducedMotion) drawWind(ctx, state, camX, w, h);

  // Vignette, to sit the playfield inside the page rather than on top of it.
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, h * 0.95);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(60,40,15,0.35)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}
