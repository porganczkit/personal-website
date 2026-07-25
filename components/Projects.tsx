import EvtolModel from './models/EvtolModel';

// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS — a set of live, interactive financial models visitors can play with.
// ─────────────────────────────────────────────────────────────────────────────

export default function Projects() {
  return (
    <div className="bg-white">
      {/* Fade from the dark timeline above into the white Projects section */}
      <div className="h-24 bg-gradient-to-b from-[#1a0e02] to-white" />

      <div className="mx-auto max-w-5xl px-6 pb-28">
        {/* Section header */}
        <div className="py-16 text-center">
          <p className="mb-3 text-xs font-light uppercase tracking-[0.35em] text-gray-400">
            Projects
          </p>
          <h2 className="font-serif text-4xl font-medium text-gray-900 md:text-5xl">
            Interactive Models
          </h2>
          <div className="mx-auto mt-5 h-px w-10 bg-gold-500" />
          <p className="mx-auto mt-6 max-w-xl text-[1.05rem] font-light leading-relaxed text-gray-600">
            I like to pressure-test businesses by modelling their unit economics from the
            ground up. Here are a couple you can play with yourself — drag the sliders and
            watch the numbers move.
          </p>
        </div>

        {/* Models */}
        <div className="space-y-12">
          <EvtolModel />
        </div>

        {/* Teaser for the next model */}
        <p className="mt-10 text-center text-sm font-light text-gray-400">
          Next up: the unit economics behind AI frontier models — coming soon.
        </p>
      </div>
    </div>
  );
}
