import type { InputState } from '../../lib/freedom-pit';

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard → InputState. Desktop only; there is no touch scheme by design.
// ─────────────────────────────────────────────────────────────────────────────

const BINDINGS: Record<string, keyof InputState> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyJ: 'action',
  Space: 'action',
  KeyK: 'attack',
  KeyB: 'bribe',
};

/** Keys we own while playing, so the page never scrolls under the canvas. */
const SWALLOWED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export interface InputSource {
  state: InputState;
  /** True for exactly one read after Escape or P is pressed. */
  takePauseToggle(): boolean;
  release(): void;
  detach(): void;
}

export function attachInput(target: HTMLElement): InputSource {
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
    if (e.code === 'Escape' || e.code === 'KeyP') {
      pauseToggle = true;
      e.preventDefault();
      return;
    }
    const action = BINDINGS[e.code];
    if (!action) return;
    if (SWALLOWED.has(e.code)) e.preventDefault();
    state[action] = true;
  };

  const onKeyUp = (e: KeyboardEvent) => {
    const action = BINDINGS[e.code];
    if (!action) return;
    if (SWALLOWED.has(e.code)) e.preventDefault();
    state[action] = false;
  };

  // Alt-tabbing away must not leave a key stuck down.
  const onBlur = () => release();

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
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
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
