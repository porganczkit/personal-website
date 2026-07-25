import { useMemo, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// eVTOL FLIGHT ECONOMICS — interactive unit-economics model
// Route anchor: Downtown Manhattan → JFK (~17 mi, ~12 min).
// Defaults are illustrative, based on public estimates for Joby/Archer-class
// aircraft. Everything is editable via the sliders.
// ─────────────────────────────────────────────────────────────────────────────

const SEATS = 4; // passenger seats (pilot excluded)
const LIFE_YEARS = 10; // aircraft economic life used for depreciation

const DEFAULTS = {
  price: 130, // $ per seat
  loadFactor: 75, // %
  energyKwh: 130, // kWh per flight
  elecPrice: 0.2, // $ per kWh
  pilot: 45, // $ per flight (0 ≈ autonomous)
  maintenance: 60, // $ per flight
  vertiport: 90, // $ per flight (take-off + landing fees)
  aircraftPriceM: 4, // $ millions
  flightsPerDay: 20, // per aircraft
};

type State = typeof DEFAULTS;

const money = (v: number, dp = 0) =>
  `$${v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  display,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  display: string;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-light text-gray-600">{label}</span>
        <span className="text-sm font-medium tabular-nums text-gray-900">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        // Prevent the mouse wheel from changing the value while scrolling the page.
        onWheel={(e) => e.currentTarget.blur()}
        className="mt-2 w-full accent-gold-500 cursor-pointer"
      />
    </label>
  );
}

export default function EvtolModel() {
  const [s, setS] = useState<State>(DEFAULTS);
  const set = (k: keyof State) => (v: number) => setS((prev) => ({ ...prev, [k]: v }));

  const m = useMemo(() => {
    const pax = SEATS * (s.loadFactor / 100);
    const revenue = pax * s.price;
    const energy = s.energyKwh * s.elecPrice;
    const lifetimeFlights = s.flightsPerDay * 365 * LIFE_YEARS;
    const depreciation = (s.aircraftPriceM * 1_000_000) / lifetimeFlights;

    const costs = [
      { label: 'Energy', value: energy },
      { label: 'Pilot', value: s.pilot },
      { label: 'Maintenance', value: s.maintenance },
      { label: 'Vertiport fees', value: s.vertiport },
      { label: 'Aircraft depreciation', value: depreciation },
    ];
    const totalCost = costs.reduce((a, c) => a + c.value, 0);
    const profit = revenue - totalCost;
    const margin = revenue > 0 ? profit / revenue : 0;
    const breakeven = pax > 0 ? totalCost / pax : 0;
    const dailyProfit = profit * s.flightsPerDay;
    const annualProfit = dailyProfit * 365;

    return { pax, revenue, costs, totalCost, profit, margin, breakeven, dailyProfit, annualProfit };
  }, [s]);

  const maxCost = Math.max(...m.costs.map((c) => c.value), 1);
  const positive = m.profit >= 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-100 px-6 py-6 sm:px-8">
        <p className="text-[11px] font-light tracking-[0.25em] text-gold-500 uppercase">
          Interactive model 01
        </p>
        <h3 className="mt-2 font-serif text-2xl font-medium text-gray-900">
          eVTOL Flight Economics
        </h3>
        <p className="mt-1 text-sm font-light text-gray-500">
          Downtown Manhattan → JFK&nbsp; · &nbsp;~17 mi&nbsp; · &nbsp;~12 min
        </p>
        <p className="mt-4 max-w-xl text-[0.95rem] font-light leading-relaxed text-gray-600">
          What does it cost to fly an electric air taxi across New York — and can it turn a
          profit? Drag the assumptions and watch the per-flight economics move in real time.
        </p>
      </div>

      <div className="grid lg:grid-cols-2">
        {/* Controls */}
        <div className="space-y-5 px-6 py-7 sm:px-8">
          <Slider label="Ticket price / seat" value={s.price} onChange={set('price')} min={50} max={400} step={5} display={money(s.price)} />
          <Slider label="Load factor" value={s.loadFactor} onChange={set('loadFactor')} min={25} max={100} step={5} display={`${s.loadFactor}%  ·  ${m.pax.toFixed(1)} pax`} />
          <Slider label="Energy per flight" value={s.energyKwh} onChange={set('energyKwh')} min={50} max={300} step={5} display={`${s.energyKwh} kWh`} />
          <Slider label="Electricity price" value={s.elecPrice} onChange={set('elecPrice')} min={0.05} max={0.5} step={0.01} display={`${money(s.elecPrice, 2)}/kWh`} />
          <Slider label="Pilot cost / flight" value={s.pilot} onChange={set('pilot')} min={0} max={150} step={5} display={s.pilot === 0 ? 'Autonomous' : money(s.pilot)} />
          <Slider label="Maintenance / flight" value={s.maintenance} onChange={set('maintenance')} min={10} max={200} step={5} display={money(s.maintenance)} />
          <Slider label="Vertiport fees / flight" value={s.vertiport} onChange={set('vertiport')} min={0} max={250} step={5} display={money(s.vertiport)} />
          <Slider label="Aircraft price" value={s.aircraftPriceM} onChange={set('aircraftPriceM')} min={1} max={10} step={0.5} display={`$${s.aircraftPriceM}M`} />
          <Slider label="Flights / day (per aircraft)" value={s.flightsPerDay} onChange={set('flightsPerDay')} min={5} max={40} step={1} display={`${s.flightsPerDay}`} />

          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] font-light text-gray-400">
              Fixed: {SEATS} seats · {LIFE_YEARS}-yr aircraft life
            </p>
            <button
              onClick={() => setS(DEFAULTS)}
              className="text-[11px] font-light uppercase tracking-widest text-gray-500 underline transition-colors hover:text-gold-600"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="border-t border-gray-100 bg-gray-50/70 px-6 py-7 sm:px-8 lg:border-l lg:border-t-0">
          {/* Headline tiles */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white p-4 ring-1 ring-gray-100">
              <p className="text-[10px] font-light uppercase tracking-widest text-gray-400">Profit / flight</p>
              <p className={`mt-1 font-serif text-2xl font-medium tabular-nums ${positive ? 'text-gold-600' : 'text-red-500'}`}>
                {positive ? '' : '−'}
                {money(Math.abs(m.profit))}
              </p>
            </div>
            <div className="rounded-xl bg-white p-4 ring-1 ring-gray-100">
              <p className="text-[10px] font-light uppercase tracking-widest text-gray-400">Margin</p>
              <p className={`mt-1 font-serif text-2xl font-medium tabular-nums ${positive ? 'text-gray-900' : 'text-red-500'}`}>
                {(m.margin * 100).toFixed(0)}%
              </p>
            </div>
            <div className="rounded-xl bg-white p-4 ring-1 ring-gray-100">
              <p className="text-[10px] font-light uppercase tracking-widest text-gray-400">Breakeven / seat</p>
              <p className="mt-1 font-serif text-2xl font-medium tabular-nums text-gray-900">{money(m.breakeven)}</p>
            </div>
          </div>

          {/* Revenue vs cost */}
          <div className="mt-6 flex items-center justify-between text-sm">
            <span className="font-light text-gray-500">Revenue / flight</span>
            <span className="font-medium tabular-nums text-gray-900">{money(m.revenue)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="font-light text-gray-500">Total cost / flight</span>
            <span className="font-medium tabular-nums text-gray-900">{money(m.totalCost)}</span>
          </div>

          {/* Cost breakdown */}
          <p className="mt-6 text-[11px] font-light uppercase tracking-widest text-gray-400">
            Cost breakdown / flight
          </p>
          <div className="mt-3 space-y-2.5">
            {m.costs.map((c) => (
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
              <p className={`mt-1 font-serif text-xl font-medium tabular-nums ${positive ? 'text-gray-900' : 'text-red-500'}`}>
                {positive ? '' : '−'}
                {money(Math.abs(m.dailyProfit))}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-light uppercase tracking-widest text-gray-400">Profit / year · aircraft</p>
              <p className={`mt-1 font-serif text-xl font-medium tabular-nums ${positive ? 'text-gray-900' : 'text-red-500'}`}>
                {positive ? '' : '−'}
                {money(Math.abs(m.annualProfit))}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="border-t border-gray-100 px-6 py-4 sm:px-8">
        <p className="text-[11px] font-light leading-relaxed text-gray-400">
          Illustrative defaults based on public estimates for Joby / Archer-class aircraft. A
          simplified model for exploration — not investment advice.
        </p>
      </div>
    </div>
  );
}
