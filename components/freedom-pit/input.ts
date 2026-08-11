import type { InputState } from '../../lib/freedom-pit';

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard → InputState. Desktop only; there is no touch scheme by design.
//
// Listeners live on `window`, not on the canvas container. Hanging them off a
// focusable div meant the game silently did nothing whenever focus was not
// where we assumed — which is exactly what happened after clicking "Start the
// shift": the browser left focus on <body> and every key was dropped. This page
// exists to run the game, so the game listens to the page.
// ─────────────────────────────────────────────────────────────────────────────

/** By physical key position — layout-independent, and what a real keyboard sends. */
const BY_CODE: Record<string, keyof InputState> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'action',
  KeyK: 'attack',
  KeyB: 'bribe',
};

/**
 * By the character produced. Needed because `code` is not always populated —
 * some input methods, remote desktops and automation send `key` only, and the
 * game was completely dead for them. It also rescues non-QWERTY layouts, where
 * the key printed W is not in the `KeyW` position.
 */
const BY_KEY: Record<string, keyof InputState> = {
  w: 'up',
  arrowup: 'up',
  s: 'down',
  arrowdown: 'down',
  a: 'left',
  arrowleft: 'left',
  d: 'right',
  arrowright: 'right',
  ' ': 'action',
  spacebar: 'action',
  k: 'attack',
  b: 'bribe',
};

/** Keys we own while playing, so the page never scrolls under the canvas. */
const SWALLOWED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
const SWALLOWED_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'spacebar']);

function resolve(e: KeyboardEvent): keyof InputState | undefined {
  return BY_CODE[e.code] ?? BY_KEY[(e.key || '').toLowerCase()];
}

function shouldSwallow(e: KeyboardEvent): boolean {
  return SWALLOWED.has(e.code) || SWALLOWED_KEYS.has((e.key || '').toLowerCase());
}

function isPauseKey(e: KeyboardEvent): boolean {
  const key = (e.key || '').toLowerCase();
  return e.code === 'Escape' || e.code === 'KeyP' || key === 'escape' || key === 'p';
}

/**
 * Never steal a key from something the visitor is actually using — a button
 * still needs Space and Enter, and a text field needs everything.
 */
function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, a, input, textarea, select') !== null;
}

export interface InputSource {
  state: InputState;
  /** True for exactly one read after Escape or P is pressed. */
  takePauseToggle(): boolean;
  release(): void;
  detach(): void;
}

export function attachInput(): InputSource {
  const state: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    action: false,
    attack: false,
    bribe: false,
  };
  let pauseToggle = false;

  const release = () => {
    for (const key of Object.keys(state) as (keyof InputState)[]) state[key] = false;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (isInteractiveTarget(e.target)) return;

    if (isPauseKey(e)) {
      pauseToggle = true;
      e.preventDefault();
      return;
    }
    const action = resolve(e);
    if (!action) return;
    if (shouldSwallow(e)) e.preventDefault();
    state[action] = true;
  };

  const onKeyUp = (e: KeyboardEvent) => {
    const action = resolve(e);
    if (!action) return;
    if (shouldSwallow(e)) e.preventDefault();
    state[action] = false;
  };

  // Alt-tabbing away must not leave a key stuck down.
  const onBlur = () => release();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    state,
    takePauseToggle() {
      const was = pauseToggle;
      pauseToggle = false;
      return was;
    },
    release,
    detach() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
