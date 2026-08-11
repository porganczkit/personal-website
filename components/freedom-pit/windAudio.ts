import { CONFIG, windSoundParams } from '../../lib/freedom-pit';

// ─────────────────────────────────────────────────────────────────────────────
// The wind, synthesised. No audio files: brown noise through a low-pass, with
// a slow LFO breathing over the level and the cutoff so it pulses rather than
// sitting there as flat hiss.
//
//   noise ──▶ lowpass ──▶ gain ──▶ destination
//                 ▲         ▲
//                 └── lfo ──┘   (adds to both, hence the pulsing)
//
// Browsers refuse to start audio without a user gesture, so nothing here is
// constructed until start() is called from the click on "Start the shift".
// ─────────────────────────────────────────────────────────────────────────────

type Ctor = typeof AudioContext;

function audioContextCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function isAudioSupported(): boolean {
  return audioContextCtor() !== null;
}

/** A couple of seconds of brown noise — closer to moving air than white noise. */
function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const seconds = 3;
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }

  // Cross-fade the tail into the head so the loop point is inaudible.
  const fade = Math.floor(ctx.sampleRate * 0.25);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    data[i] = data[i] * t + data[length - fade + i] * (1 - t);
  }

  return buffer;
}

export class WindAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoToGain: GainNode | null = null;
  private lfoToCutoff: GainNode | null = null;
  private muted = false;
  private disposed = false;

  get supported(): boolean {
    return isAudioSupported();
  }

  /** Safe to call repeatedly; only the first call builds the graph. */
  async start(): Promise<void> {
    if (this.disposed || this.ctx) {
      await this.resume();
      return;
    }
    const Ctor = audioContextCtor();
    if (!Ctor) return;

    const ctx = new Ctor();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = CONFIG.audio.minCutoff;
    filter.Q.value = 0.7;
    filter.connect(master);

    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx);
    noise.loop = true;
    noise.connect(filter);
    noise.start();

    // One LFO drives both the level and the cutoff, so the pulse is heard as a
    // single gust rather than two unrelated wobbles.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = CONFIG.audio.minPulse;

    const lfoToGain = ctx.createGain();
    lfoToGain.gain.value = 0;
    lfo.connect(lfoToGain).connect(master.gain);

    const lfoToCutoff = ctx.createGain();
    lfoToCutoff.gain.value = 0;
    lfo.connect(lfoToCutoff).connect(filter.frequency);

    lfo.start();

    this.master = master;
    this.filter = filter;
    this.noise = noise;
    this.lfo = lfo;
    this.lfoToGain = lfoToGain;
    this.lfoToCutoff = lfoToCutoff;

    await this.resume();
  }

  /** Push the current wind strength into the graph. Cheap; call often. */
  setForce(force: number, gusting: boolean): void {
    const { ctx, master, filter, lfo, lfoToGain, lfoToCutoff } = this;
    if (!ctx || !master || !filter || !lfo || !lfoToGain || !lfoToCutoff) return;

    const p = windSoundParams(force, gusting);
    const now = ctx.currentTime;
    const tau = CONFIG.audio.smoothing;
    const target = this.muted ? 0 : p.gain;

    // setTargetAtTime glides exponentially — no zipper noise, no clicks.
    master.gain.setTargetAtTime(target, now, tau);
    filter.frequency.setTargetAtTime(p.cutoff, now, tau);
    lfo.frequency.setTargetAtTime(p.lfoRate, now, tau);
    lfoToGain.gain.setTargetAtTime(this.muted ? 0 : p.lfoDepth, now, tau);
    // Let the cutoff breathe by up to a third of its value.
    lfoToCutoff.gain.setTargetAtTime(this.muted ? 0 : p.cutoff * 0.33, now, tau);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    const { ctx, master, lfoToGain } = this;
    if (!ctx || !master || !lfoToGain) return;
    if (muted) {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      lfoToGain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    }
    // Unmuting is handled by the next setForce, which knows the current wind.
  }

  async resume(): Promise<void> {
    if (this.ctx?.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // Autoplay policy can still refuse; silence is an acceptable outcome.
      }
    }
  }

  /** Fade out and stop the clock — used for pause and game over. */
  async suspend(): Promise<void> {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    try {
      await ctx.suspend();
    } catch {
      // Already suspended, or closing — nothing useful to do.
    }
  }

  dispose(): void {
    this.disposed = true;
    try {
      this.noise?.stop();
      this.lfo?.stop();
      void this.ctx?.close();
    } catch {
      // Nodes may already be stopped if the context went away first.
    }
    this.ctx = null;
    this.master = null;
    this.filter = null;
    this.noise = null;
    this.lfo = null;
    this.lfoToGain = null;
    this.lfoToCutoff = null;
  }
}
