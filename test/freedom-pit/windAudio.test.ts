// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../../lib/freedom-pit/config';
import { windSoundParams } from '../../lib/freedom-pit/windsound';
import { WindAudio } from '../../components/freedom-pit/windAudio';

// ─────────────────────────────────────────────────────────────────────────────
// A stand-in for the Web Audio API. Real audio needs a browser, a user gesture
// and a pair of ears, none of which a test has — but the graph wiring and the
// values pushed into it are ordinary logic, and those are what break.
// ─────────────────────────────────────────────────────────────────────────────

class FakeParam {
  value = 0;
  history: number[] = [];
  setTargetAtTime(target: number) {
    this.value = target;
    this.history.push(target);
    return this;
  }
  setValueAtTime(target: number) {
    this.value = target;
    return this;
  }
  exponentialRampToValueAtTime(target: number) {
    // Good enough for assertions: record the destination of the ramp.
    this.value = target;
    this.history.push(target);
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class FakeNode {
  connectedTo: unknown[] = [];
  connect<T>(target: T): T {
    this.connectedTo.push(target);
    return target;
  }
  disconnect() {}
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}
class FakeBiquad extends FakeNode {
  type = '';
  frequency = new FakeParam();
  Q = new FakeParam();
}
class FakeOscillator extends FakeNode {
  type = '';
  frequency = new FakeParam();
  running = false;
  start() {
    this.running = true;
  }
  stop() {
    this.running = false;
  }
}
class FakeBufferSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  running = false;
  start() {
    this.running = true;
  }
  stop() {
    this.running = false;
  }
}

class FakeAudioContext {
  state: 'running' | 'suspended' | 'closed' = 'suspended';
  sampleRate = 8000; // small, so the noise buffer is cheap to generate
  currentTime = 0;
  destination = new FakeNode();
  closed = false;

  createGain() {
    return new FakeGain();
  }
  createBiquadFilter() {
    return new FakeBiquad();
  }
  createOscillator() {
    return new FakeOscillator();
  }
  createBufferSource() {
    return new FakeBufferSource();
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  }
  async resume() {
    this.state = 'running';
  }
  async suspend() {
    this.state = 'suspended';
  }
  async close() {
    this.closed = true;
    this.state = 'closed';
  }
}

interface Internals {
  ctx: FakeAudioContext | null;
  master: FakeGain;
  filter: FakeBiquad;
  noise: FakeBufferSource;
  lfo: FakeOscillator;
  lfoToGain: FakeGain;
  lfoToCutoff: FakeGain;
}
const inside = (a: WindAudio) => a as unknown as Internals;

beforeEach(() => {
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
});

let audio: WindAudio | null = null;
afterEach(() => {
  audio?.dispose();
  audio = null;
});

describe('wind audio graph', () => {
  it('builds noise → filter → gain → speakers, with the LFO on both', async () => {
    audio = new WindAudio();
    await audio.start();
    const g = inside(audio);

    expect(g.noise.loop).toBe(true);
    expect(g.noise.running).toBe(true);
    expect(g.filter.type).toBe('lowpass');
    expect(g.lfo.running).toBe(true);
    expect(g.noise.connectedTo).toContain(g.filter);
    expect(g.filter.connectedTo).toContain(g.master);
    expect(g.master.connectedTo).toContain(g.ctx!.destination);
    // One oscillator drives level and cutoff, so the pulse reads as one gust.
    expect(g.lfo.connectedTo).toContain(g.lfoToGain);
    expect(g.lfo.connectedTo).toContain(g.lfoToCutoff);
    expect(g.lfoToGain.connectedTo).toContain(g.master.gain);
    expect(g.lfoToCutoff.connectedTo).toContain(g.filter.frequency);
  });

  it('starts silent, so nothing barks at you the instant the shift begins', async () => {
    audio = new WindAudio();
    await audio.start();
    expect(inside(audio).master.gain.value).toBe(0);
  });

  it('resumes the context, which autoplay policy leaves suspended', async () => {
    audio = new WindAudio();
    await audio.start();
    expect(inside(audio).ctx!.state).toBe('running');
  });

  it('pushes exactly the parameters the model asks for', async () => {
    audio = new WindAudio();
    await audio.start();
    const g = inside(audio);

    for (const force of [0.2, 0.55, 0.95]) {
      const expected = windSoundParams(force, false);
      audio.setForce(force, false);

      expect(g.master.gain.value).toBeCloseTo(expected.gain, 6);
      expect(g.filter.frequency.value).toBeCloseTo(expected.cutoff, 6);
      expect(g.lfo.frequency.value).toBeCloseTo(expected.lfoRate, 6);
      expect(g.lfoToGain.gain.value).toBeCloseTo(expected.lfoDepth, 6);
    }
  });

  it('pulses harder and faster in a gale than in a breeze', async () => {
    audio = new WindAudio();
    await audio.start();
    const g = inside(audio);

    audio.setForce(0.15, false);
    const calm = { gain: g.master.gain.value, rate: g.lfo.frequency.value };
    audio.setForce(0.95, false);

    expect(g.master.gain.value).toBeGreaterThan(calm.gain);
    expect(g.lfo.frequency.value).toBeGreaterThan(calm.rate);
  });

  it('goes silent when muted, and stays silent as the wind changes', async () => {
    audio = new WindAudio();
    await audio.start();
    const g = inside(audio);

    audio.setMuted(true);
    audio.setForce(0.9, true);

    expect(g.master.gain.value).toBe(0);
    expect(g.lfoToGain.gain.value).toBe(0);
  });

  it('comes back at the right level when unmuted', async () => {
    audio = new WindAudio();
    await audio.start();
    const g = inside(audio);

    audio.setMuted(true);
    audio.setForce(0.6, false);
    audio.setMuted(false);
    audio.setForce(0.6, false);

    expect(g.master.gain.value).toBeCloseTo(windSoundParams(0.6, false).gain, 6);
  });

  it('never drives the level above the configured ceiling', async () => {
    audio = new WindAudio();
    await audio.start();
    const g = inside(audio);

    for (const f of [0, 0.5, 1, 5, -2, NaN]) {
      audio.setForce(f, true);
      expect(g.master.gain.value).toBeLessThanOrEqual(CONFIG.audio.maxGain);
      expect(g.master.gain.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('plays an audible test burst, whatever the wind is doing', async () => {
    audio = new WindAudio();
    await audio.start();
    const g = inside(audio);

    audio.setForce(0.01, false); // near silence
    audio.testTone();

    // The ramp peaks far above anything the wind model would ask for.
    expect(Math.max(...g.master.gain.history)).toBeGreaterThan(0.8);
  });

  it('does not let the wind stamp on a test burst still ringing out', async () => {
    audio = new WindAudio();
    await audio.start();
    const g = inside(audio);

    audio.testTone();
    const during = g.master.gain.value;
    audio.setForce(0.01, false); // would otherwise drop it to near zero

    expect(g.master.gain.value).toBe(during);
  });

  it('tolerates a test burst before the graph exists', () => {
    audio = new WindAudio();
    expect(() => audio!.testTone()).not.toThrow();
  });

  it('tolerates setForce before start, rather than throwing mid-frame', () => {
    audio = new WindAudio();
    expect(() => audio!.setForce(0.5, false)).not.toThrow();
  });

  it('shuts everything down on dispose', async () => {
    const a = new WindAudio();
    await a.start();
    const g = inside(a);
    const ctx = g.ctx!;

    a.dispose();

    expect(ctx.closed).toBe(true);
    expect(g.ctx).toBeNull();
  });

  it('degrades to nothing when the browser has no Web Audio at all', async () => {
    (window as unknown as { AudioContext: unknown }).AudioContext = undefined;
    (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext = undefined;

    audio = new WindAudio();
    await audio.start();

    expect(inside(audio).ctx).toBeNull();
    expect(() => audio!.setForce(0.8, false)).not.toThrow();
  });
});
