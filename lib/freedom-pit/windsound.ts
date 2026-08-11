import { CONFIG } from './config';

// ─────────────────────────────────────────────────────────────────────────────
// How the wind should sound at a given force. Pure arithmetic, deliberately
// kept out of the audio graph so it can be tested without a browser — the same
// split that keeps the simulation testable.
// ─────────────────────────────────────────────────────────────────────────────

export interface WindSoundParams {
  /** Base level, 0–maxGain. Zero means genuinely silent, not merely quiet. */
  gain: number;
  /** Low-pass cutoff in Hz. Rising force opens it up from rumble to hiss. */
  cutoff: number;
  /** Pulse rate in Hz. */
  lfoRate: number;
  /** Pulse amplitude, in the same units as gain. Always less than gain, so the
   *  level breathes without ever crossing zero and inverting phase. */
  lfoDepth: number;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function windSoundParams(force: number, gusting = false): WindSoundParams {
  const cfg = CONFIG.audio;
  const f = clamp01(force);

  // Slightly superlinear, so calm air stays genuinely in the background and the
  // loud end of the range has somewhere to go.
  const boosted = Math.pow(f, 1.25) * (gusting ? cfg.gustBoost : 1);
  const gain = Math.min(cfg.maxGain, cfg.maxGain * boosted);

  return {
    gain,
    cutoff: lerp(cfg.minCutoff, cfg.maxCutoff, f),
    lfoRate: lerp(cfg.minPulse, cfg.maxPulse, f),
    lfoDepth: gain * lerp(cfg.minDepth, cfg.maxDepth, f),
  };
}
