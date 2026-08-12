// ─────────────────────────────────────────────────────────────────────────────
// Every tunable number in the game lives here. Nothing else should contain a
// magic constant — the balance harness (npm run balance) sweeps these.
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG = {
  world: {
    segments: 60,
    segmentWidth: 90,
    height: 600,
    /**
     * You work the near lip of the trench. The desert is one connected band
     * from groundTop down to pitTop — the far bank is scenery, not playfield,
     * so nothing (you, scorpions, foremen) can ever be stranded across the pit.
     */
    groundTop: 40,
    pitTop: 380,
    /** Render only: where the trench stops and the far bank begins. */
    pitBottom: 560,
    /** Sand mounds spawn inside this Y band, back from the lip. */
    sandBand: [90, 335] as const,
  },

  view: { width: 960, height: 600 },

  pit: {
    /** m³ per segment. 60 × 5 = 300 m³ of capacity for a 100 m³ quota. */
    capacity: 5,
    /** Seconds a segment is immune to wind right after you top it up. */
    shelterTime: 1.2,
  },

  quota: {
    initial: 100, // m³ of sand that must be *sitting in the pit* at once
    bossPenalty: 20,
  },

  player: {
    speed: 170,
    accel: 1400,
    radius: 14,
    /** How close to a mound you must stand to dig. Generous on purpose: being
     * fractionally out of range is indistinguishable from a broken key. */
    reach: 46,
    dumpReach: 30, // how close to the pit edge you must stand to dump
    digTime: 0.4,
    shovelLoad: 0.5, // m³ per shovel
    maxHealth: 3,
    stunTime: 1.2,
    invulnTime: 1.5,
    /**
     * Seconds without being stung before you get a heart back. A shift runs
     * 6–9 minutes with scorpions on you the whole time; without recovery the
     * back half is unsurvivable, and the truck's stationary load is a free hit.
     */
    regenAfter: 40,
    swingRange: 78,
    swingHalfAngle: 1.25, // radians — a wide sweep, and it auto-aims besides
    /**
     * The shovel is heavy. Without this wind-up the swing resolves on the frame
     * you press it, and since it outranges a bite by 30-odd pixels, no scorpion
     * could ever land a hit — they were a time tax rather than a threat. Kept
     * short: it only needs to make a lunge a genuine trade, not a lost fight.
     */
    swingWindup: 0.06,
    swingDuration: 0.22,
    swingCooldown: 0.42,
  },

  truck: {
    /** Promotion fires once the pit first reaches this fraction of the quota. */
    unlockAt: 0.3,
    speed: 265,
    accel: 520, // deliberately sluggish — the truck has weight
    radius: 22,
    capacity: 6, // m³
    loadRate: 1, // m³/s at a loader → 6 s for a full tray
    dumpRate: 2.6, // m³/s while tipping
    /** Minimum speed at which the truck crushes a scorpion instead of stopping. */
    crushSpeed: 90,
    loaderReach: 60,
    /**
     * In the cab you are untouchable — except parked at a loader, where a
     * scorpion needs this long to climb up to you. Pulling away shakes it off,
     * at the cost of the loading time. The load is the tension, not a free hit.
     */
    climbTime: 1.6,
  },

  mounds: {
    count: 8,
    /** m³ per mound. Small enough that mounds visibly run dry and move you on. */
    volume: 6,
    radius: 26,
  },

  wind: {
    baseTarget: 0.22,
    meanReversion: 0.5,
    volatility: 0.45,
    gustEvery: [18, 40] as const,
    gustDuration: [3, 6] as const,
    gustTarget: 0.85,
    /** m³/s blown out of a *full* segment at force 1. Scales with force². */
    erosionRate: 0.029,
    /** Wind volatility multiplier at 100 % progress — the endgame gets nastier. */
    lateGameScale: 1.6,
  },

  scorpion: {
    spawnEvery: 13,
    maxAlive: 5,
    /** Slower than you, so you can always walk away from one. */
    speed: 110,
    radius: 11,
    jitter: 0.9,
    /** Small: killing scorpions must not become the way you fund bribes. */
    bounty: 8,
    /**
     * The lunge is what makes them dangerous. A plain chase always loses to a
     * shovel — the swing outranges contact by more than they can close. Dashing
     * beats the swing cooldown, so a second scorpion arriving mid-cooldown gets
     * through. It is dodgeable: the dash commits to a straight line.
     */
    lungeRange: 80,
    /**
     * It rears up first, stationary, aiming at where you are standing at that
     * instant. This telegraph is what makes the dash fair: without it a 300px/s
     * lunge is simply unreactable, and it is also the window to kill it in.
     */
    rearTime: 0.35,
    lungeSpeed: 300,
    lungeTime: 0.32,
    /** Spent and sluggish afterwards — the window in which you kill it. */
    lungeRecover: 1.6,
    recoverySpeed: 0.45,
    /** Spawn interval shrinks toward this multiple as the quota fills. */
    lateGameScale: 0.6,
  },

  boss: {
    arriveEvery: [70, 110] as const,
    walkSpeed: 70,
    /** He gets impatient: speed grows by this much per second of pursuit. */
    speedRamp: 6,
    maxSpeed: 150,
    contactRadius: 34,
    /** Seconds you have to decide once he has cornered you. */
    decisionTime: 4,
    /** Deliberately more than a shift's takings can cover for every foreman. */
    bribeCost: 180,
    radius: 15,
  },

  economy: {
    coinsPerCubicMetre: 5,
  },

  /**
   * The wind is synthesised, not sampled: brown noise through a low-pass whose
   * cutoff and level track the wind force, with an LFO breathing over the top.
   * Pulse rate rises with force, so a gale sounds hurried as well as loud.
   */
  audio: {
    /**
     * Measured, not guessed. The first pass used maxGain 0.42 with a force^1.25
     * curve over brown noise low-passed at 260 Hz, which put ordinary wind at
     * -38 dBFS — genuinely inaudible on laptop speakers. Pink noise carries far
     * more mid-range, and this curve keeps normal weather around -23 dBFS while
     * still leaving a gale roughly 9 dB louder.
     */
    maxGain: 1,
    /**
     * Exponent on force. Well below 1: wind sits near 0.22 almost all the time,
     * and even 0.7 left ordinary weather at -23 dBFS, which was still being
     * reported as silence. At 0.45 it lands near -18.6 dBFS — unmistakably
     * present — while a gale reaches -13 without clipping the normalised noise.
     */
    curve: 0.45,
    minCutoff: 500, // Hz — calm air, muffled
    maxCutoff: 4000, // Hz — a gale hisses
    minPulse: 0.16, // Hz — one slow breath every six seconds
    maxPulse: 0.9,
    /** Depth of the pulse, as a fraction of the current level. */
    minDepth: 0.35,
    maxDepth: 0.65,
    gustBoost: 1.18,
    /** Seconds for the level to chase a change — long enough to avoid clicks. */
    smoothing: 0.35,
  },
} as const;

export type Config = typeof CONFIG;

export const WORLD_WIDTH = CONFIG.world.segments * CONFIG.world.segmentWidth;
export const PIT_CAPACITY = CONFIG.world.segments * CONFIG.pit.capacity;
