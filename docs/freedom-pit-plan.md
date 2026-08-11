# Freedom Pit — design, build & test plan

A top-down browser game for ptibor.bio. You are a labourer on a Gulf giga-project,
shovelling sand into an endless pit. Hit the volume quota and you get your passport back.

---

## 1. Architectural decisions (made up front, so the rest is mechanical)

| Decision | Choice | Why |
|---|---|---|
| Rendering | Single HTML `<canvas>` 2D, no engine | ~200 sprites max; Phaser/Pixi would add 400–1000 kB to a site whose whole point is being fast. Canvas 2D is enough. |
| Dependencies | **Zero new runtime deps** | Keeps the Vercel build and the bundle as they are today. |
| Where it lives | New route `pages/freedompit.tsx`, **unlisted** — nothing on the site links to it, and it carries `noindex` | Keeps the game's JS out of the homepage bundle (Next code-splits per page), and a game loop fighting the timeline's IntersectionObservers on the same page is asking for jank. Shared by URL only; see §9. |
| Platform | **Desktop / keyboard only.** Mobile visitors get a polite "best on desktop" card instead of the canvas | A dig-and-swing game on a virtual stick is a project of its own. Decided out of scope, not deferred-and-forgotten. |
| Code shape | **Pure simulation in `lib/freedom-pit/`, rendering + input in `components/freedom-pit/`** | This is the single most important choice: the sim is plain TS with no DOM, so it can be unit-tested and balance-tested headlessly in milliseconds. |
| Loop | Fixed timestep 60 Hz accumulator, `requestAnimationFrame` for render only | Deterministic physics → seeded replays → reproducible bug reports. |
| Randomness | Seeded PRNG (mulberry32, ~5 lines) passed through the state, never `Math.random()` | Same seed ⇒ same game. Essential for the tests in §5. |
| State ownership | Sim state lives in a `useRef`, **not** `useState`. React renders only the HUD, at ~10 Hz | 60 Hz `setState` would melt the reconciler. |
| Art | Programmatic shapes + a couple of small PNG/SVG sprites in `public/freedom-pit/` | Start grey-box; art is phase 6, not phase 1. |

### File layout

```
lib/freedom-pit/
  types.ts        # GameState, Entity, Config — all shapes in one place
  config.ts       # every tunable number (see §3), no magic numbers elsewhere
  rng.ts          # mulberry32 seeded PRNG
  pit.ts          # segment fill / dump / erode math
  wind.ts         # wind model
  entities.ts     # player, scorpion, boss update fns
  sim.ts          # step(state, input, dt) -> state   ← the whole game, pure
  index.ts
components/freedom-pit/
  FreedomPit.tsx  # canvas element, rAF loop, wiring
  useGameLoop.ts  # fixed-timestep accumulator
  input.ts        # keyboard → InputState
  render.ts       # draw(ctx, state) — pure draw, no logic
  Hud.tsx         # freedom timer, health, wind gauge, coins, messages
  DesktopOnly.tsx # fallback card shown below the mobile breakpoint
pages/freedompit.tsx
test/freedom-pit/  # vitest specs + balance harness
```

The contract that makes everything else work:

```ts
step(state: GameState, input: InputState, dt: number): GameState
draw(ctx: CanvasRenderingContext2D, state: GameState): void
```

`step` never touches `window`, `Date`, or `Math.random`. `draw` never mutates state.

---

## 2. Game design

### The world
A long horizontal trench running across the middle of the screen, camera scrolling
sideways with the player. Desert sand above and below the trench, heat shimmer,
long shadows. The pit is modelled as **60 segments**, each with `fill` (m³) and a
capacity — not per-pixel sand physics. Rendered as a heightmap: darker + deeper
shadow when empty, level with the ground when full.

### Core loop (phase 1)
1. Walk onto open sand, hold **dig** → shovel fills (0.5 s).
2. Walk to the pit edge, press **dump** → sand goes into the nearest segment.
3. Delivered volume counts toward the quota. Fill the quota → **freedom**.

WASD/arrows to move (8-way), `Space` to dig-and-dump (context-sensitive:
digs on sand, dumps at the pit), `K` to swing the shovel at a scorpion.

### The Freedom Timer
The primary HUD element: a bar showing `delivered / quota` — how close you are to
getting out. It is a **progress meter, not a countdown**; there is no death by clock,
so the only thing that can end your shift badly is running out of health. Its job is
to make every shovel-load feel like it counts and to make a boss's `+25 m³` land as a
visible, infuriating step *backwards* — the bar physically shrinks when the quota grows.
Elapsed time is shown next to it as a plain stopwatch, for the end-screen brag and a
personal-best in local storage.

### Antagonist 1 — Wind
A scalar force `w ∈ [0,1]` plus a direction, evolving as an Ornstein–Uhlenbeck
random walk (mean-reverting, so it drifts rather than flickers), with occasional
**gust events** that spike it for 3–6 s. Each segment loses sand per second:

```
erosion = K_EROSION * w^2 * (fill / capacity) * dt
```

`w²` makes big wind disproportionately punishing; the `fill/capacity` term means
fuller segments erode faster, so the interesting decision is *spread wide vs. top
up one segment*. A windsock in the HUD and blowing sand streaks telegraph it, and
a rising howl warns of a gust — the player should always be able to see it coming.

### Antagonist 2 — Scorpions
Spawn from off-screen edges every ~12 s (cap 5 alive), scuttle toward the player at
60 % of walking speed with a little erratic jitter. Contact = bite: −1 health (of 3),
drop your shovel load, 1.2 s stun. A shovel swing has a short arc in front of you
and a cooldown, so mistiming it costs you. Killing one drops a few **coins** —
scorpions are a threat *and* an income stream, which keeps them from being pure tax.

### Antagonist 3 — Bosses
Every 45–75 s a foreman walks in from the edge with an icon over his head. He walks
toward you; when he reaches you he either takes a **bribe** (200 coins from your purse)
or, if you can't or won't pay, adds **+25 m³ to your quota** — which you watch eat
into the Freedom Timer. You earn 3 coins per m³ delivered plus small bounties from
scorpions, so bribes come straight out of progress; the economy is the joke and the
mechanic at once. Dodging a boss is possible but he speeds up the longer you avoid him.

### Progression — the truck
At **40 % of quota delivered** you're promoted. The truck carries 6 m³ vs. the
shovel's 0.25, but:
- loading at the sand loader takes 8 s (vs. 0.5 s digging),
- it turns slowly and has momentum,
- you can't kill scorpions from the cab — you must run them over or stay out of range.

So promotion is a genuine trade, not just a number going up, and the mid-game feels
different from the early game. (You can step out of the truck; that's a stretch goal.)

### Win / lose
- **Win:** the Freedom Timer fills (delivered ≥ quota) → "Freedom" screen with time
  taken, coins spent on bribes, m³ lost to wind, scorpions killed.
- **Lose:** health reaches 0 → **GAME OVER**. That is the only lose condition — there
  is no clock running you out.

### Difficulty curve
Quota 120 m³, pit capacity 300 m³ (so wind erosion has room to hurt without making
the level unwinnable). Wind volatility and scorpion spawn rate scale with
`delivered / quota`, so the last 20 % is the hard part.

---

## 3. Starting constants

> **Built.** The live numbers are in `lib/freedom-pit/config.ts` — treat that file as
> the source of truth, not the block below, which is the pre-build guess kept for
> comparison. See §8 for what the balance harness changed and why.

Everything below was a first guess to be tuned by the balance harness in §5, not gospel.

```ts
export const CONFIG = {
  pit:      { segments: 60, capacityPerSegment: 5 },        // 300 m³ total
  quota:    { initial: 120, bossPenalty: 25 },              // m³
  player:   { speed: 130, digTime: 0.5, shovelLoad: 0.25,   // px/s, s, m³
              health: 3, stunTime: 1.2, swingArc: 40, swingCooldown: 0.45 },
  truck:    { unlockAt: 0.4, speed: 190, turnRate: 2.2,
              load: 6, loadTime: 8 },
  wind:     { meanReversion: 0.35, volatility: 0.5,
              gustEvery: [18, 40], gustBoost: 0.45,
              erosionK: 0.35 },                             // m³/s at w=1, full segment
  scorpion: { spawnEvery: 12, maxAlive: 5, speed: 78, bounty: 15 },   // coins
  boss:     { arriveEvery: [45, 75], bribeCost: 200, walkSpeed: 60 },
  economy:  { coinsPerCubicMetre: 3 },
} as const;
```

---

## 4. Build phases

Each phase ends with something **playable in the browser** — never a phase whose
output can only be judged by reading code.

| # | Phase | Deliverable | Done when |
|---|---|---|---|
| 0 | Scaffold | Route, canvas, fixed-timestep loop, seeded RNG, config, empty `step`/`draw` | A grey rectangle animates at a stable 60 fps; tab-blur pauses it |
| 1 | **Core loop** | Player, camera, pit segments, dig/dump, Freedom Timer, win screen | You can win a wind-free, scorpion-free game in ~3 min. **This is the "is it fun at all?" gate** |
| 2 | Wind | OU wind model, erosion, windsock, sand-streak particles, gusts | Standing still visibly loses ground; the windsock reads before the gust lands |
| 3 | Scorpions | Spawning, chase AI, bite/stun/drop, shovel swing + cooldown, bounty | Ignoring them costs you; killing them is satisfying and slightly risky |
| 4 | Bosses & economy | Coin purse, boss arrival/approach, bribe prompt, quota penalty visibly shrinking the Freedom Timer | The bribe-or-suffer choice is legible in under 2 seconds |
| 5 | Truck | Promotion event, vehicle physics, loader, mode-specific rules | Promotion changes how you play, not just how fast |
| 6 | Polish | Sprites, palette, shadows, sound (a wind bed + 4 SFX), screen shake, reduced-motion, pause menu, desktop-only fallback card | Muted by default; matches the site's charcoal/gold restraint |
| 7 | Ship | Projects card, OG image, local-storage best time, Lighthouse pass, deploy | Live on ptibor.bio, latest commit is "Current" in Vercel |

Phases 2–5 are independent of each other — if one turns out unfun, cut it without
unpicking the rest.

**Rough effort:** phase 1 is a solid session; 2–5 are ~half a session each; polish
is as long as you let it be. Ship after phase 4 if you want it live sooner — wind +
scorpions + bosses is already a complete game, and the truck is the best cut candidate.

---

## 5. Testing

Add **Vitest** (`vitest` + `@vitejs/plugin-react` as devDeps, `npm test`). It runs
TypeScript natively with no config beyond a 5-line `vitest.config.ts`. The pure-sim
architecture is what makes this cheap — no jsdom, no canvas mocking.

### 5.1 Unit tests — the sim (the bulk of the value)
- `pit`: dumping into a full segment doesn't exceed capacity and doesn't lose the load silently; total delivered is conserved; erosion never drives fill below 0.
- `wind`: over 10 000 ticks the force stays in `[0,1]`, mean sits near the target, and a gust actually raises it.
- `player`: dig→carry→dump moves exactly `shovelLoad`; dumping empty-handed is a no-op; a bite drops the load and applies the stun; you can't act while stunned.
- `scorpion`: chases the player; a swing inside the arc kills, outside doesn't; the cooldown blocks a second swing.
- `boss`: reaching an unpaying player adds exactly `bossPenalty`; a paid bribe deducts coins and adds nothing; you can't bribe with insufficient coins; coins never go negative.
- `sim`: win fires at `delivered >= quota`, once; loss fires at health 0; no state transitions after game over. A quota raised past `delivered` un-wins nothing — a boss can never trigger a win, and can never retroactively cancel one.

### 5.2 Determinism / replay
Run `step` 20 000 times from seed 42 with a recorded input tape, hash the final state.
Assert the hash. This one test catches almost every accidental `Math.random()`,
`Date.now()`, or hidden mutation — and it is the regression net for all later refactors.

### 5.3 Balance harness (headless, and the reason for the whole architecture)
`test/freedom-pit/balance.ts` — a script that runs the sim with a **scripted bot**
(naive policy: dig nearest sand, dump nearest non-full segment, swing at anything
within range, always bribe) across 200 seeds and prints:

- win rate, median time-to-quota, p10/p90 spread
- m³ lost to wind, coins earned vs. spent on bribes, bites taken
- how much of the final quota was boss-inflicted rather than the starting 120 m³

Target for the naive bot: **wins ~40–60 % of runs in 6–9 minutes**. With health as the
only lose condition, a bot that never wins means the scorpions are killing it — check
that number first when tuning. If the bot wins every time, the game is too easy for
a human. Tune `config.ts` against this instead of by playing it 40 times yourself.
Add `--sweep erosionK=0.2,0.35,0.5` to compare tunings in one run.

### 5.4 Browser verification (per phase, not just at the end)
Run the dev server (`npm run dev`, port 3001), then on `/freedompit`:
- console clean, no leaked rAF/listeners after unmount (mount/unmount 10×, watch memory)
- frame time under 16 ms with max entities alive — instrument a p95 frame-time counter behind `?debug=1`
- keyboard: no arrow-key page scrolling, no stuck keys after tab switch, game pauses on blur
- canvas scales cleanly from 1024 to 2560 wide and on a 2× retina display
- below the mobile breakpoint the desktop-only card shows and **the game loop never starts**
- `prefers-reduced-motion` kills shake and shimmer
- screenshot each phase's result to keep a visual record

### 5.5 Playtest
After phase 4, three people, no instructions. Watch for: do they discover dumping
without being told? Do they read the windsock? Do they understand the bribe prompt
in time? A tutorial hint is a last resort — first try to fix the readability.

### 5.6 CI (optional)
`npm run type-check && npm test` on push. Given the deploy is push-to-Vercel, a
failing test that blocks the merge is worth the 20 minutes to set up.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Fun is unproven until phase 1 ends | Phase 1 is deliberately tiny and playable — kill or rescope there, not after building all three antagonists |
| Wind feels arbitrary/unfair | Telegraph every gust (windsock, audio, visible streaks) with ≥1.5 s of warning; never erode a segment the player is actively filling |
| Three antagonists at once = noise | They're separately toggleable via config; ship with whichever combination reads clearly |
| Desktop-only means phone visitors hit a dead end | The fallback card has to be charming, not an error — a still frame of the pit and "Freedom Pit needs a keyboard." Track how much of your traffic that is before deciding whether mobile is ever worth building |
| Health is the only lose condition | Scorpion tuning therefore carries the entire difficulty of losing. Watch the bot's death rate in §5.3 — if it's near zero the game has no stakes, and the fix is scorpion pressure, not a re-added clock |
| Scope creep on art | Grey-box until phase 6; the site's palette (charcoal/gold on sand) does most of the aesthetic work for free |
| Setting reads as mockery of real workers | Aim the satire squarely upward — at the bosses and the quota, never at the labourer, who is the hero. Worth a second read of the copy before shipping |

---

## 7. First three actions

1. `npm i -D vitest` + `vitest.config.ts` + `"test": "vitest"` in `package.json`.
2. Write `lib/freedom-pit/{types,config,rng}.ts` and a failing test for `pit.dump()`.
3. Build phase 0 + 1 and play it before writing a single line of wind code.

---

## 8. What the build changed (post-mortem)

Everything in §4 shipped, phases 0–7. Six things the plan got wrong, all but one
found by the balance harness in §5.3 rather than by playing it:

**1. The quota had to measure sand *currently in the pit*, not sand ever shovelled.**
The plan implied a cumulative counter. With one, wind is decorative — you can never
lose progress, so erosion costs nothing. `freedomProgress` reads `totalFill(state) / quota`,
and there is a test pinning exactly this (`sim.test.ts`, "measures the quota against
sand in the pit"). This is the single most important correction.

**2. The trench cannot span the world.** As first built, the pit ran the full 5,400 px
with desert on both sides — making the far bank unreachable, stranding half the mounds
and loaders, and giving scorpions and foremen no path to the player. The bot walked
into the wall forever and delivered 19 m³ in twenty minutes. The desert is now one
connected band along the near lip; the far bank is scenery.

**3. Melee needed a wind-up, and scorpions needed a telegraph.** The harness recorded
**zero bites across 25 runs** while the bot killed 140 scorpions — they were a time tax,
not a threat, because an instant swing outranges a bite by 33 px and always wins. Fixing
it took three passes: a lunge (beats the swing cooldown), a 0.08 s wind-up on the shovel
(0.12 s made a lunge unbeatable — dead in 30 s), and a 0.35 s rear-up before the dash so
it is readable and dodgeable. Risk now comes from overlapping attackers, as intended.

**4. The truck's stationary load was a death trap.** Six seconds parked and defenceless
meant three bites in 4.5 s, killing the bot every run at ~4:00. Scorpions now have to
*climb* the cab (1.6 s), so pulling away shakes them off at the cost of the load — the
tension survives, the guaranteed hit does not. Health also regenerates one heart per
40 s, without which a 7-minute shift under constant harassment is unsurvivable.

**5. The economy was funded by the wrong thing.** Scorpion bounties at 25 coins paid for
every bribe, so the quota never moved and the foremen were inert. Bounty is now 8, coins
5/m³, bribes 180 — the bot affords roughly two-thirds of the foremen it meets.

**6. Pause was a one-way door.** Not a harness find — caught in the browser. The pause
toggle was read inside the fixed-step callback, which stops running while paused, so Esc
could pause but never resume. It is read in the render callback now, which always runs.

**Where it landed** (200 seeds, `npm run balance`):

```
win rate 89%   median 6:52   p10 4:17   p90 10:05
promoted 3:10  wind takes 25% of everything shovelled
foremen add 19 m³   0.53 stings/run   22 deaths in 200
```

One caveat worth keeping in mind when tuning further: **the bot has one-frame reactions**,
so it dodges better than a person and its 89 % is an upper bound, not a human win rate.
Trust the harness on time, throughput, wind share and the economy; do not tune scorpion
difficulty down just because the bot rarely dies. That needs the §5.5 playtest.

**Not built:** phase 6's audio (no wind bed or SFX yet) and the OG image. Both are
additive and need no structural change.

---

## 9. Privacy posture — unlisted *and* password-gated

The game is at **`/freedompit`**. Four things protect it:

1. **Nothing links to it.** No card in Projects, no nav entry — the site has no
   path that leads a visitor here.
2. **`noindex, nofollow, noarchive, nosnippet`**, plus an explicit `googlebot`
   directive, so a crawler that learns the URL keeps it out of results.
3. **No `robots.txt` entry and no sitemap.** Listing the path in `robots.txt` would
   publish the very URL we are trying not to publish.
4. **A server-side password gate.** `getServerSideProps` checks a cookie before
   rendering anything; the game itself is a `next/dynamic` import, so a locked-out
   visitor never downloads it (the page ships 5.85 kB instead of 14.1 kB).

### Why the gate is server-side
The repo is **public**, so the route name is discoverable in the source regardless —
obscurity alone was never going to hold. A check in the browser would be worse than
useless: it would ship the whole game to everyone and be undone from the console in
seconds. The gate therefore runs on the server, and the game is code-split behind it.

### How the secret is handled
- `FREEDOM_PIT_PASSWORD` is an environment variable, set in Vercel. It is never
  committed; `.env.local` holds a throwaway value for development and is gitignored.
- **The cookie never contains the password** — it holds `HMAC-SHA256(password, "freedompit-access-v1")`.
  A stolen cookie does not reveal the secret, and rotating the password invalidates
  every cookie already issued.
- Comparisons are constant-time (over SHA-256 digests, so unequal lengths do not
  throw and do not leak length through timing).
- The cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production, 30-day lifetime.
- `/api/freedompit-auth` is rate-limited to 8 attempts per IP per minute, and its
  failure response says only "incorrect" — no hint about length or format.
- The page sets `Cache-Control: no-store`, so no CDN ever caches a page whose content
  depends on a private cookie.
- **It fails closed:** with `FREEDOM_PIT_PASSWORD` unset, nobody gets in.

### What this still is not
A single shared password with no per-person identity, no revocation short of rotating
it for everyone, and no audit trail. It is the right weight for an unreleased side
project; it is not authentication. If it ever guards something that matters, move to
Vercel Password Protection or Vercel Authentication at the project level.
