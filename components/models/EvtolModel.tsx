import { useEffect, useMemo, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// eVTOL FLIGHT ECONOMICS — interactive unit-economics model (scenario mode)
// Route anchor: Downtown Manhattan → JFK (~12 mi, ~10 min).
//
// Each driver is a low–high RANGE. The model reports a base case (midpoints)
// plus the full pessimistic ↔ optimistic envelope. Default ranges are sourced
// from public reporting + analyst estimates (Joby/Archer disclosures, a
// published Joby unit-economics analysis, NYSERDA rates, Glassdoor pilot pay).
// ─────────────────────────────────────────────────────────────────────────────

const SEATS = 4; // passenger seats (pilot excluded)
const LIFETIME_FLIGHTS = 150_000; // airframe cycle life used for depreciation

type Bounds = { low: number; high: number };

const DEFAULT_RANGES = {
  price: { low: 100, high: 200 }, // $ per seat
  loadFactor: { low: 60, high: 90 }, // %
  energyKwh: { low: 20, high: 30 }, // kWh per flight
  elecPrice: { low: 0.15, high: 0.3 }, // $ per kWh
  pilot: { low: 15, high: 40 }, // $ per flight
  maintenance: { low: 6, high: 25 }, // $ per flight
  battery: { low: 4, high: 12 }, // $ per flight
  vertiport: { low: 40, high: 150 }, // $ per flight
  groundOps: { low: 25, high: 60 }, // $ per flight
  aircraftPriceM: { low: 1.3, high: 4 }, // $ millions
  flightsPerDay: { low: 15, high: 41 }, // per aircraft
};

type Ranges = typeof DEFAULT_RANGES;
type Key = keyof Ranges;

// Drivers where a higher value HELPS profit (everything else hurts it).
const REVENUE_KEYS = new Set<Key>(['price', 'loadFactor', 'flightsPerDay']);

const CONTROLS: {
  key: Key;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
}[] = [
  { key: 'price', label: 'Ticket price / seat', min: 40, max: 400, step: 5, fmt: (v) => money(v) },
  { key: 'loadFactor', label: 'Load factor', min: 25, max: 100, step: 5, fmt: (v) => `${v}%` },
  { key: 'energyKwh', label: 'Energy per flight', min: 10, max: 100, step: 1, fmt: (v) => `${v} kWh` },
  { key: 'elecPrice', label: 'Electricity price', min: 0.05, max: 0.5, step: 0.01, fmt: (v) => `${money(v, 2)}/kWh` },
  { key: 'pilot', label: 'Pilot cost / flight', min: 0, max: 150, step: 5, fmt: (v) => money(v) },
  { key: 'maintenance', label: 'Maintenance / flight', min: 5, max: 100, step: 1, fmt: (v) => money(v) },
  { key: 'battery', label: 'Battery amort. / flight', min: 0, max: 50, step: 1, fmt: (v) => money(v) },
  { key: 'vertiport', label: 'Vertiport fees / flight', min: 0, max: 250, step: 5, fmt: (v) => money(v) },
  { key: 'groundOps', label: 'Ground ops & overhead', min: 0, max: 150, step: 5, fmt: (v) => money(v) },
  { key: 'aircraftPriceM', label: 'Aircraft price', min: 0.5, max: 8, step: 0.1, fmt: (v) => `$${v.toFixed(1)}M` },
  { key: 'flightsPerDay', label: 'Flights / day (per aircraft)', min: 5, max: 45, step: 1, fmt: (v) => `${v}` },
];

// Verified public sources behind the default ranges.
const SOURCES: { note: string; name: string; url: string }[] = [
  {
    note: 'Route & flight time',
    name: 'BloombergNEF — Manhattan to JFK in 7 minutes',
    url: 'https://about.bnef.com/insights/clean-transport/manhattan-to-jfk-in-7-minutes-in-affordable-electric-air-taxi/',
  },
  {
    note: 'Ticket price (~$195/seat, 4 seats)',
    name: 'Simple Flying — Joby’s first JFK–Manhattan flights',
    url: 'https://simpleflying.com/joby-first-flights-jfk-manhattan/',
  },
  {
    note: 'Ticket price (~Uber Black)',
    name: 'Fox News — air-taxi ride pricing',
    url: 'https://www.foxnews.com/travel/air-taxis-cut-hour-long-commutes-minutes-riders-may-shocked-price',
  },
  {
    note: 'Cost breakdown (pilot, fees, utilization, airframe life)',
    name: 'Risk Premium Research — Joby: Unit Economics',
    url: 'https://riskpremiumresearch.substack.com/p/joby-unit-economics',
  },
  {
    note: 'Energy per flight',
    name: 'Risk Premium Research — Joby Unit Economics: Energy Consumption',
    url: 'https://riskpremiumresearch.substack.com/p/joby-unit-economics-energy-consumption',
  },
  {
    note: 'Energy efficiency (academic)',
    name: 'PNAS / PMC — energy-efficient battery-powered urban aircraft',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8609345/',
  },
  {
    note: 'Maintenance & operating cost',
    name: 'Vertical Magazine — why Uber thinks eVTOLs will be affordable',
    url: 'https://verticalmag.com/news/why-uber-thinks-evtol-air-taxis-will-be-affordable/',
  },
  {
    note: 'Cost trajectory',
    name: 'ARK Invest — electric air-taxi cost analysis',
    url: 'https://www.ark-invest.com/articles/analyst-research/electric-air-taxi-cost-drop',
  },
  {
    note: 'Aircraft price / valuation',
    name: 'Kerrisdale Capital — Joby Aviation report (PDF)',
    url: 'https://www.kerrisdalecap.com/wp-content/uploads/2023/10/Joby-Aviation-JOBY.pdf',
  },
  {
    note: 'Electricity price',
    name: 'NYSERDA — NY commercial electricity rates',
    url: 'https://www.nyserda.ny.gov/Energy-Prices/Electricity/Monthly-Avg-Electricity-Commercial',
  },
  {
    note: 'Pilot pay',
    name: 'Glassdoor — helicopter pilot salary',
    url: 'https://www.glassdoor.com/Salaries/helicopter-pilot-salary-SRCH_KO0,16.htm',
  },
];

function money(v: number, dp = 0) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}
const smoney = (v: number, dp = 0) => (v < 0 ? '−' : '') + money(Math.abs(v), dp);
const pct = (v: number) => {
  const n = Math.round(v * 100);
  return `${n < 0 ? '−' : ''}${Math.abs(n)}%`;
};

function RangeSlider({
  label,
  min,
  max,
  step,
  low,
  high,
  onLow,
  onHigh,
  fmt,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  low: number;
  high: number;
  onLow: (v: number) => void;
  onHigh: (v: number) => void;
  fmt: (v: number) => string;
}) {
  const p = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-light text-gray-600">{label}</span>
        <span className="text-sm font-medium tabular-nums text-gray-900">
          {fmt(low)} – {fmt(high)}
        </span>
      </div>
      <div className="relative mt-3 h-4">
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-gray-200" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-gold-400"
          style={{ left: `${p(low)}%`, width: `${p(high) - p(low)}%` }}
        />
        <input
          type="range"
          className="range-dual"
          min={min}
          max={max}
          step={step}
          value={low}
          aria-label={`${label} — minimum`}
          onChange={(e) => onLow(Math.min(parseFloat(e.target.value), high))}
          onWheel={(e) => e.currentTarget.blur()}
        />
        <input
          type="range"
          className="range-dual"
          min={min}
          max={max}
          step={step}
          value={high}
          aria-label={`${label} — maximum`}
          onChange={(e) => onHigh(Math.max(parseFloat(e.target.value), low))}
          onWheel={(e) => e.currentTarget.blur()}
        />
      </div>
    </div>
  );
}

function metrics(v: Record<Key, number>) {
  const pax = SEATS * (v.loadFactor / 100);
  const revenue = pax * v.price;
  const energy = v.energyKwh * v.elecPrice;
  const depreciation = (v.aircraftPriceM * 1_000_000) / LIFETIME_FLIGHTS;
  const costs = [
    { label: 'Energy', value: energy },
    { label: 'Pilot', value: v.pilot },
    { label: 'Maintenance', value: v.maintenance },
    { label: 'Battery amortization', value: v.battery },
    { label: 'Vertiport fees', value: v.vertiport },
    { label: 'Ground ops & overhead', value: v.groundOps },
    { label: 'Aircraft depreciation', value: depreciation },
  ];
  const totalCost = costs.reduce((a, c) => a + c.value, 0);
  const profit = revenue - totalCost;
  const margin = revenue > 0 ? profit / revenue : 0;
  const breakeven = pax > 0 ? totalCost / pax : 0;
  const dailyProfit = profit * v.flightsPerDay;
  const annualProfit = dailyProfit * 365;
  return { revenue, costs, totalCost, profit, margin, breakeven, dailyProfit, annualProfit };
}

// ── Monte Carlo (Beta-PERT sampling) ─────────────────────────────────────────
// Standard normal via Box–Muller.
function randn(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
// Marsaglia–Tsang gamma sampler (shape k ≥ 1 — always true for Beta-PERT).
function gammaSample(k: number): number {
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const x = randn();
    let v = 1 + c * x;
    if (v <= 0) continue;
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
// Beta-PERT sample on [a, b] with mode c (shape weight λ = 4).
function betaPertSample(a: number, c: number, b: number): number {
  if (b <= a) return a;
  const alpha = 1 + (4 * (c - a)) / (b - a);
  const beta = 1 + (4 * (b - c)) / (b - a);
  const g1 = gammaSample(alpha);
  const g2 = gammaSample(beta);
  return a + (g1 / (g1 + g2)) * (b - a);
}

type MCResult = {
  trials: number;
  mean: number;
  p5: number;
  p50: number;
  p95: number;
  pLoss: number;
  counts: number[];
  binMin: number;
  binMax: number;
};

function runMonteCarlo(ranges: Ranges, trials = 10_000, bins = 28): MCResult {
  const profits = new Float64Array(trials);
  const keys = Object.keys(ranges) as Key[];
  let sum = 0;
  let losses = 0;
  for (let t = 0; t < trials; t++) {
    const v = {} as Record<Key, number>;
    for (const k of keys) {
      const { low, high } = ranges[k];
      v[k] = betaPertSample(low, (low + high) / 2, high);
    }
    const p = metrics(v).profit;
    profits[t] = p;
    sum += p;
    if (p < 0) losses++;
  }
  const sorted = Float64Array.from(profits).sort();
  const q = (f: number) => sorted[Math.min(trials - 1, Math.max(0, Math.floor(f * (trials - 1))))];
  const binMin = sorted[0];
  const binMax = sorted[trials - 1];
  const span = binMax - binMin || 1;
  const counts = new Array(bins).fill(0);
  for (let t = 0; t < trials; t++) {
    let i = Math.floor(((profits[t] - binMin) / span) * bins);
    if (i >= bins) i = bins - 1;
    if (i < 0) i = 0;
    counts[i] += 1;
  }
  return {
    trials,
    mean: sum / trials,
    p5: q(0.05),
    p50: q(0.5),
    p95: q(0.95),
    pLoss: losses / trials,
    counts,
    binMin,
    binMax,
  };
}

function Histogram({ counts, min, max }: { counts: number[]; min: number; max: number }) {
  const maxCount = Math.max(...counts, 1);
  const binWidth = (max - min || 1) / counts.length;
  return (
    <div>
      <div className="flex h-36 items-end gap-px">
        {counts.map((c, i) => {
          const isLoss = min + (i + 0.5) * binWidth < 0;
          return (
            <div
              key={i}
              className={`flex-1 rounded-t-sm ${isLoss ? 'bg-red-400/70' : 'bg-gold-400'}`}
              style={{ height: `${(c / maxCount) * 100}%` }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-light tabular-nums text-gray-400">
        <span>{smoney(min)}</span>
        <span>break-even $0</span>
        <span>{smoney(max)}</span>
      </div>
    </div>
  );
}

export default function EvtolModel() {
  const [r, setR] = useState<Ranges>(DEFAULT_RANGES);
  const [mc, setMc] = useState<MCResult | null>(null);
  const [running, setRunning] = useState(false);
  const setBound = (key: Key, bound: keyof Bounds) => (val: number) =>
    setR((prev) => ({ ...prev, [key]: { ...prev[key], [bound]: val } }));

  // Clear stale simulation results whenever the input ranges change.
  useEffect(() => setMc(null), [r]);

  const runSim = () => {
    setRunning(true);
    // Let the "Running…" label paint before the (brief) synchronous compute.
    setTimeout(() => {
      setMc(runMonteCarlo(r));
      setRunning(false);
    }, 20);
  };

  const { base, opt, pess } = useMemo(() => {
    const resolve = (dir: 'base' | 'opt' | 'pess'): Record<Key, number> => {
      const out = {} as Record<Key, number>;
      (Object.keys(r) as Key[]).forEach((k) => {
        const { low, high } = r[k];
        if (dir === 'base') out[k] = (low + high) / 2;
        else {
          const wantHigh = REVENUE_KEYS.has(k) ? dir === 'opt' : dir === 'pess';
          out[k] = wantHigh ? high : low;
        }
      });
      return out;
    };
    return { base: metrics(resolve('base')), opt: metrics(resolve('opt')), pess: metrics(resolve('pess')) };
  }, [r]);

  const maxCost = Math.max(...base.costs.map((c) => c.value), 1);

  const Tile = ({
    label,
    value,
    range,
    tone,
  }: {
    label: string;
    value: string;
    range: string;
    tone?: 'gold' | 'red' | 'plain';
  }) => (
    <div className="rounded-xl bg-white p-4 ring-1 ring-gray-100">
      <p className="text-[10px] font-light uppercase tracking-widest text-gray-400">{label}</p>
      <p
        className={`mt-1 font-serif text-2xl font-medium tabular-nums ${
          tone === 'gold' ? 'text-gold-600' : tone === 'red' ? 'text-red-500' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] font-light tabular-nums text-gray-400">{range}</p>
    </div>
  );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-100 px-6 py-6 sm:px-8">
        <p className="text-[11px] font-light tracking-[0.25em] text-gold-500 uppercase">
          Interactive model 01
        </p>
        <h3 className="mt-2 font-serif text-2xl font-medium text-gray-900">eVTOL Flight Economics</h3>
        <p className="mt-1 text-sm font-light text-gray-500">
          Downtown Manhattan → JFK&nbsp; · &nbsp;~12 mi&nbsp; · &nbsp;~10 min
        </p>
        <p className="mt-4 max-w-xl text-[0.95rem] font-light leading-relaxed text-gray-600">
          Set a low–high range for each assumption. The model reports a base case plus the full
          pessimistic ↔ optimistic envelope — a live sensitivity analysis for an electric air
          taxi across New York.
        </p>
      </div>

      <div className="grid lg:grid-cols-2">
        {/* Controls */}
        <div className="space-y-5 px-6 py-7 sm:px-8">
          {CONTROLS.map((c) => (
            <RangeSlider
              key={c.key}
              label={c.label}
              min={c.min}
              max={c.max}
              step={c.step}
              low={r[c.key].low}
              high={r[c.key].high}
              onLow={setBound(c.key, 'low')}
              onHigh={setBound(c.key, 'high')}
              fmt={c.fmt}
            />
          ))}

          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] font-light text-gray-400">
              Fixed: {SEATS} seats · {LIFETIME_FLIGHTS.toLocaleString()}-cycle airframe life
            </p>
            <button
              onClick={() => setR(DEFAULT_RANGES)}
              className="text-[11px] font-light uppercase tracking-widest text-gray-500 underline transition-colors hover:text-gold-600"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="border-t border-gray-100 bg-gray-50/70 px-6 py-7 sm:px-8 lg:border-l lg:border-t-0">
          <p className="mb-3 text-[11px] font-light text-gray-400">
            Base case (range midpoints) · low–high = pessimistic ↔ optimistic
          </p>

          {/* Headline tiles */}
          <div className="grid grid-cols-3 gap-3">
            <Tile
              label="Profit / flight"
              value={smoney(base.profit)}
              range={`${smoney(pess.profit)} – ${smoney(opt.profit)}`}
              tone={base.profit >= 0 ? 'gold' : 'red'}
            />
            <Tile
              label="Margin"
              value={pct(base.margin)}
              range={`${pct(pess.margin)} – ${pct(opt.margin)}`}
              tone={base.profit >= 0 ? 'plain' : 'red'}
            />
            <Tile
              label="Breakeven / seat"
              value={money(base.breakeven)}
              range={`${money(opt.breakeven)} – ${money(pess.breakeven)}`}
            />
          </div>

          {/* Revenue vs cost */}
          <div className="mt-6 flex items-baseline justify-between text-sm">
            <span className="font-light text-gray-500">Revenue / flight</span>
            <span className="font-medium tabular-nums text-gray-900">
              {money(base.revenue)}
              <span className="ml-2 text-[11px] font-light text-gray-400">
                {money(pess.revenue)}–{money(opt.revenue)}
              </span>
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between text-sm">
            <span className="font-light text-gray-500">Total cost / flight</span>
            <span className="font-medium tabular-nums text-gray-900">
              {money(base.totalCost)}
              <span className="ml-2 text-[11px] font-light text-gray-400">
                {money(opt.totalCost)}–{money(pess.totalCost)}
              </span>
            </span>
          </div>

          {/* Cost breakdown (base case) */}
          <p className="mt-6 text-[11px] font-light uppercase tracking-widest text-gray-400">
            Cost breakdown / flight — base case
          </p>
          <div className="mt-3 space-y-2.5">
            {base.costs.map((c) => (
              <div key={c.label}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-light text-gray-600">{c.label}</span>
                  <span className="font-medium tabular-nums text-gray-900">{money(c.value)}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-gold-400 transition-all duration-200"
                    style={{ width: `${(c.value / maxCost) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Daily / annual rollup */}
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-gray-200 pt-5">
            <div>
              <p className="text-[10px] font-light uppercase tracking-widest text-gray-400">Profit / day · aircraft</p>
              <p className={`mt-1 font-serif text-xl font-medium tabular-nums ${base.profit >= 0 ? 'text-gray-900' : 'text-red-500'}`}>
                {smoney(base.dailyProfit)}
              </p>
              <p className="text-[11px] font-light tabular-nums text-gray-400">
                {smoney(pess.dailyProfit)} – {smoney(opt.dailyProfit)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-light uppercase tracking-widest text-gray-400">Profit / year · aircraft</p>
              <p className={`mt-1 font-serif text-xl font-medium tabular-nums ${base.profit >= 0 ? 'text-gray-900' : 'text-red-500'}`}>
                {smoney(base.annualProfit)}
              </p>
              <p className="text-[11px] font-light tabular-nums text-gray-400">
                {smoney(pess.annualProfit)} – {smoney(opt.annualProfit)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Monte Carlo simulation */}
      <div className="border-t border-gray-100 px-6 py-7 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-light uppercase tracking-[0.25em] text-gold-500">
              Monte Carlo simulation
            </p>
            <p className="mt-1 text-sm font-light text-gray-500">
              10,000 trials · Beta-PERT sampling over each range (peak at the base case)
            </p>
          </div>
          <button
            onClick={runSim}
            disabled={running}
            className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-light tracking-wide text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
          >
            {running ? 'Running…' : mc ? 'Re-run' : 'Run simulation'}
          </button>
        </div>

        {mc && (
          <div className="mt-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100">
                <p className="text-[10px] font-light uppercase tracking-widest text-gray-400">Prob. of loss</p>
                <p className={`mt-1 font-serif text-2xl font-medium tabular-nums ${mc.pLoss > 0.33 ? 'text-red-500' : 'text-gray-900'}`}>
                  {(mc.pLoss * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100">
                <p className="text-[10px] font-light uppercase tracking-widest text-gray-400">P5 · downside</p>
                <p className="mt-1 font-serif text-2xl font-medium tabular-nums text-gray-900">{smoney(mc.p5)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100">
                <p className="text-[10px] font-light uppercase tracking-widest text-gray-400">Median · P50</p>
                <p className="mt-1 font-serif text-2xl font-medium tabular-nums text-gray-900">{smoney(mc.p50)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100">
                <p className="text-[10px] font-light uppercase tracking-widest text-gray-400">P95 · upside</p>
                <p className="mt-1 font-serif text-2xl font-medium tabular-nums text-gray-900">{smoney(mc.p95)}</p>
              </div>
            </div>

            <p className="mt-6 text-[11px] font-light uppercase tracking-widest text-gray-400">
              Profit / flight distribution
            </p>
            <div className="mt-3">
              <Histogram counts={mc.counts} min={mc.binMin} max={mc.binMax} />
            </div>
            <p className="mt-3 text-[11px] font-light leading-relaxed text-gray-400">
              Mean {smoney(mc.mean)} / flight. Each driver is sampled independently — real-world
              correlations between drivers are not modelled.
            </p>
          </div>
        )}
      </div>

      {/* Disclaimer + sources */}
      <div className="border-t border-gray-100 px-6 py-4 sm:px-8">
        <p className="text-[11px] font-light leading-relaxed text-gray-400">
          A simplified model for exploration — not investment advice. Default ranges are drawn
          from the public sources below.
        </p>
        <details className="mt-2">
          <summary className="cursor-pointer select-none text-[11px] font-light uppercase tracking-widest text-gray-500 transition-colors hover:text-gold-600">
            Sources &amp; references
          </summary>
          <ul className="mt-3 space-y-1.5">
            {SOURCES.map((s) => (
              <li key={s.url} className="text-[11px] font-light leading-relaxed text-gray-500">
                <span className="text-gray-400">{s.note} — </span>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 underline decoration-gray-300 underline-offset-2 transition-colors hover:text-gold-600"
                >
                  {s.name}
                </a>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
