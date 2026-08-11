// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { attachInput } from '../../components/freedom-pit/input';
import type { InputSource } from '../../components/freedom-pit/input';

// ─────────────────────────────────────────────────────────────────────────────
// These exist because the first version of this game shipped completely
// unplayable. The listeners were attached to the canvas container, but after
// clicking "Start the shift" the browser left focus on <body> — key events go
// to the focused element and bubble up to window, so they never reached a
// descendant div. Every key was dead, and none of the 41 headless tests could
// see it, because none of them went through the DOM.
// ─────────────────────────────────────────────────────────────────────────────

let source: InputSource | null = null;

afterEach(() => {
  source?.detach();
  source = null;
});

function press(init: KeyboardEventInit): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(e);
  return e;
}

function release(init: KeyboardEventInit): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, ...init }));
}

describe('keyboard input', () => {
  it('listens on window, so it does not depend on where focus happens to be', () => {
    source = attachInput();
    // Dispatched at document.body — exactly what a real key press does when the
    // page has just been clicked and focus landed on the body.
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyJ', key: 'j', bubbles: true })
    );
    expect(source.state.action).toBe(true);
  });

  it.each([
    ['KeyW', 'w', 'up'],
    ['KeyS', 's', 'down'],
    ['KeyA', 'a', 'left'],
    ['KeyD', 'd', 'right'],
    ['KeyJ', 'j', 'action'],
    ['Space', ' ', 'action'],
    ['KeyK', 'k', 'attack'],
    ['KeyB', 'b', 'bribe'],
    ['ArrowUp', 'ArrowUp', 'up'],
    ['ArrowDown', 'ArrowDown', 'down'],
  ] as const)('binds %s', (code, key, action) => {
    source = attachInput();
    press({ code, key });
    expect(source.state[action]).toBe(true);
    release({ code, key });
    expect(source.state[action]).toBe(false);
  });

  it('works when the event carries only `key` and no `code`', () => {
    // Some input methods, remote desktops and automation send it this way.
    source = attachInput();
    press({ key: 'j' });
    expect(source.state.action).toBe(true);
    release({ key: 'j' });
    expect(source.state.action).toBe(false);
  });

  it('works when the event carries only `code` and no `key`', () => {
    source = attachInput();
    press({ code: 'KeyJ' });
    expect(source.state.action).toBe(true);
  });

  it('swallows the keys that would otherwise scroll the page', () => {
    source = attachInput();
    for (const init of [{ code: 'Space', key: ' ' }, { code: 'ArrowDown', key: 'ArrowDown' }]) {
      expect(press(init).defaultPrevented).toBe(true);
    }
  });

  it('leaves ordinary keys alone', () => {
    source = attachInput();
    expect(press({ code: 'KeyQ', key: 'q' }).defaultPrevented).toBe(false);
  });

  it('never steals keys from a button or a text field', () => {
    source = attachInput();
    const button = document.createElement('button');
    document.body.appendChild(button);

    button.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));

    expect(source.state.action).toBe(false);
    button.remove();
  });

  it('releases every key when the window loses focus, so none stick down', () => {
    source = attachInput();
    press({ code: 'KeyD', key: 'd' });
    press({ code: 'KeyJ', key: 'j' });
    expect(source.state.right).toBe(true);

    window.dispatchEvent(new Event('blur'));

    expect(source.state.right).toBe(false);
    expect(source.state.action).toBe(false);
  });

  it('reports a pause toggle exactly once per press', () => {
    source = attachInput();
    press({ code: 'Escape', key: 'Escape' });

    expect(source.takePauseToggle()).toBe(true);
    expect(source.takePauseToggle()).toBe(false);
  });

  it('accepts P as well as Escape for pause', () => {
    source = attachInput();
    press({ code: 'KeyP', key: 'p' });
    expect(source.takePauseToggle()).toBe(true);
  });

  it('stops listening once detached', () => {
    const s = attachInput();
    s.detach();
    press({ code: 'KeyD', key: 'd' });
    expect(s.state.right).toBe(false);
  });
});
