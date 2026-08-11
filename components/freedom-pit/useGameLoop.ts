import { useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Fixed-timestep accumulator. Physics always advances in equal slices — which
// is what keeps the simulation deterministic — while rendering rides on rAF.
// ─────────────────────────────────────────────────────────────────────────────

interface Options {
  step: number;
  running: boolean;
  onFixedStep: (dt: number) => void;
  onRender: () => void;
}

/** Never simulate more than this much wall time in one frame. */
const MAX_CATCH_UP = 0.25;

export function useGameLoop({ step, running, onFixedStep, onRender }: Options): void {
  const fixed = useRef(onFixedStep);
  const render = useRef(onRender);
  const active = useRef(running);

  fixed.current = onFixedStep;
  render.current = onRender;
  active.current = running;

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let accumulator = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // A backgrounded tab, a breakpoint, or a slow frame must not cause a
      // burst of catch-up steps — clamp rather than spiral.
      const elapsed = Math.min((now - last) / 1000, MAX_CATCH_UP);
      last = now;

      if (active.current) {
        accumulator += elapsed;
        while (accumulator >= step) {
          fixed.current(step);
          accumulator -= step;
        }
      } else {
        accumulator = 0;
      }
      render.current();
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [step]);
}
