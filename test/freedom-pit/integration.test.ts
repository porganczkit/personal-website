// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { attachInput } from '../../components/freedom-pit/input';
import type { InputSource } from '../../components/freedom-pit/input';
import { CONFIG, FIXED_DT, createGame, step, totalFill } from '../../lib/freedom-pit';
import { newScorpion } from '../../lib/freedom-pit/entities';
import type { GameState } from '../../lib/freedom-pit';

// ─────────────────────────────────────────────────────────────────────────────
// Real keyboard events → real input module → real simulation, with the frame
// loop driven by hand instead of requestAnimationFrame.
//
// This is the seam that kept shipping bugs. The sim tests fabricate an
// InputState and never touch the DOM; the input tests stop at the InputState
// and never touch the sim. Nothing joined the two, so "Space does not dig"
// could be true while every test passed.
// ─────────────────────────────────────────────────────────────────────────────

let source: InputSource | null = null;

afterEach(() => {
  source?.detach();
  source = null;
});

/** A real key press, delivered where the browser actually delivers it. */
function hold(code: string, key: string): void {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true }));
}
function letGo(code: string, key: string): void {
  document.body.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true }));
}

/** Advance the simulation the way the game loop would, for `seconds`. */
function run(game: GameState, input: InputSource, seconds: number): void {
  const frames = Math.ceil(seconds / FIXED_DT);
  for (let f = 0; f < frames; f++) step(game, input.state, FIXED_DT);
}

function gameAtMound(): GameState {
  const game = createGame(1);
  game.mounds = [{ id: 99, x: 2000, y: 150, volume: 10 }];
  game.player.x = 2000;
  game.player.y = 150;
  return game;
}

describe('Space, end to end', () => {
  it('digs a load when held next to a mound', () => {
    source = attachInput();
    const game = gameAtMound();

    hold('Space', ' ');
    run(game, source, CONFIG.player.digTime + 0.1);

    expect(game.player.load).toBeCloseTo(CONFIG.player.shovelLoad, 6);
  });

  it('digs nothing on a quick tap, because the dig has to be held', () => {
    source = attachInput();
    const game = gameAtMound();

    hold('Space', ' ');
    run(game, source, 0.1); // a tap
    letGo('Space', ' ');
    run(game, source, 0.5);

    expect(game.player.load).toBe(0);
  });

  it('dumps into the pit when held at the lip with a load', () => {
    source = attachInput();
    const game = gameAtMound();
    game.player.load = CONFIG.player.shovelLoad;
    game.player.y = CONFIG.world.pitTop - 20;

    hold('Space', ' ');
    run(game, source, 0.1);

    expect(game.player.load).toBe(0);
    expect(totalFill(game)).toBeCloseTo(CONFIG.player.shovelLoad, 6);
  });

  it('works from the spacebar reported as `key` only, with no `code`', () => {
    source = attachInput();
    const game = gameAtMound();

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    run(game, source, CONFIG.player.digTime + 0.1);

    expect(game.player.load).toBeCloseTo(CONFIG.player.shovelLoad, 6);
  });
});

describe('K, end to end', () => {
  it('kills a scorpion standing in front of you', () => {
    source = attachInput();
    const game = gameAtMound();
    game.player.dirX = 1;
    game.player.dirY = 0;
    game.scorpions = [newScorpion(1, game.player.x + 30, game.player.y)];

    hold('KeyK', 'k');
    run(game, source, CONFIG.player.swingWindup + 0.05);

    expect(game.scorpions).toHaveLength(0);
    expect(game.stats.scorpionsKilled).toBe(1);
  });

  it('swings on a tap, not only when held', () => {
    source = attachInput();
    const game = gameAtMound();
    game.player.dirX = 1;
    game.player.dirY = 0;
    game.scorpions = [newScorpion(1, game.player.x + 30, game.player.y)];

    hold('KeyK', 'k');
    run(game, source, FIXED_DT * 2);
    letGo('KeyK', 'k'); // released almost immediately
    run(game, source, CONFIG.player.swingWindup + 0.05);

    expect(game.scorpions).toHaveLength(0);
  });
});

describe('movement, end to end', () => {
  it('moves the worker while a direction is held, and stops on release', () => {
    source = attachInput();
    const game = gameAtMound();
    const startX = game.player.x;

    hold('KeyD', 'd');
    run(game, source, 0.5);
    const travelled = game.player.x - startX;

    letGo('KeyD', 'd');
    run(game, source, 0.5);

    expect(travelled).toBeGreaterThan(50);
    expect(game.player.x - startX - travelled).toBeLessThan(travelled * 0.5);
  });
});
