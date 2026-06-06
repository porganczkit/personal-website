import { useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// MILESTONE DATA
// To add a background image for any milestone, place the file in /public/images/
// and set the `image` field, e.g. image: '/images/neom.jpg'
// ─────────────────────────────────────────────────────────────────────────────
interface Milestone {
  id: number;
  year: string;
  role: string;
  company: string;
  location: string;
  description: string;
  image?: string; // e.g. '/images/milestone-neom.jpg'
  gradient: string; // fallback when no image is set
}

const milestones: Milestone[] = [
  {
    id: 1,
    year: '2004',
    role: 'Tax Advisor Associate',
    company: 'PwC',
    location: 'Budapest, Hungary',
    description:
      'Started career at PwC\'s Budapest office as a Tax Advisor Associate, building a foundation in financial analysis and advisory.',
    gradient: 'linear-gradient(160deg, #1a0a05 0%, #4a1c0a 55%, #1a0a05 100%)',
  },
  {
    id: 2,
    year: '2006',
    role: 'Certified Tax Advisor',
    company: 'Hungarian Chamber of Tax Advisors',
    location: 'Budapest, Hungary',
    description:
      'Certified as a Hungarian Tax Advisor — a professional qualification that deepened expertise in financial regulation, tax structuring, and client advisory.',
    gradient: 'linear-gradient(160deg, #0a1505 0%, #1e3d0a 55%, #0a1505 100%)',
  },
  {
    id: 3,
    year: '2009',
    role: 'MBA — Finance & Strategic Leadership',
    company: 'Judge Business School, University of Cambridge',
    location: 'Cambridge, United Kingdom',
    description:
      'Completed MBA at Judge Business School, University of Cambridge, specialising in finance and strategic leadership — the springboard for an international career in M&A and corporate finance.',
    image: '/api/drive-image?id=1dICReVOZHVk-7ErQyZ3SYdY9K_TeVqMt',
    gradient: 'linear-gradient(160deg, #050f1a 0%, #0e2e5c 55%, #050f1a 100%)',
  },
  {
    id: 4,
    year: '2010',
    role: 'Investment Analyst',
    company: 'Bloomberg',
    location: 'London, United Kingdom',
    description:
      'Began international finance career at Bloomberg in London, specialising in investment-grade bond valuations and financial modelling — developing rigorous analytical foundations in global capital markets.',
    gradient: 'linear-gradient(160deg, #050505 0%, #151520 55%, #050505 100%)',
  },
  {
    id: 5,
    year: '2011',
    role: 'M&A Analyst',
    company: 'Colliers International',
    location: 'London, United Kingdom',
    description:
      'Joined Colliers International in London, playing a supporting role in executing the M&A roll-up strategy — growing the European business from $50M to $200M in revenue by 2013.',
    gradient: 'linear-gradient(160deg, #050a1a 0%, #0a1e4a 55%, #050a1a 100%)',
  },
  {
    id: 6,
    year: '2014',
    role: 'Head of M&A, Asia-Pacific',
    company: 'CBRE',
    location: 'Hong Kong',
    description:
      'Joined CBRE as Head of M&A, Asia-Pacific in Hong Kong, driving cross-border acquisitions and strategic growth initiatives across one of the world\'s most dynamic real estate markets.',
    image: '/api/drive-image?id=1egBCX-W81uM-treCzwUjszxPZy59PHUW',
    gradient: 'linear-gradient(160deg, #052215 0%, #0f4a2e 55%, #052215 100%)',
  },
  {
    id: 7,
    year: '2016',
    role: 'M&A Director',
    company: 'CBRE',
    location: 'Kuala Lumpur, Malaysia',
    description: '',
    gradient: 'linear-gradient(160deg, #071a10 0%, #0e3320 55%, #071a10 100%)',
  },
  {
    id: 8,
    year: '2017',
    role: 'M&A Director',
    company: 'CBRE',
    location: 'Sydney, Australia',
    description:
      'Closed the acquisition of an Australian healthcare project management company, which became the cornerstone of CBRE Australia\'s healthcare division.',
    image: '/api/drive-image?id=1tcDgT-0qQhYN7mQ7l1D_sHXwiR0IdLoj',
    gradient: 'linear-gradient(160deg, #1a0a05 0%, #4a2205 55%, #1a0a05 100%)',
  },
  {
    id: 9,
    year: '2018',
    role: 'Finance Director, Asia-Pacific',
    company: 'WeWork',
    location: 'Hong Kong',
    description:
      'Appointed Finance Director, Asia-Pacific at WeWork to launch and scale financial operations for a new office fit-out business line — building the commercial infrastructure across the region from the ground up.',
    image: '/api/drive-image?id=1Q2bu4Cawsq1trg7N4jt90tCRV0l69qh4',
    gradient: 'linear-gradient(160deg, #0a051a 0%, #20094a 55%, #0a051a 100%)',
  },
  {
    id: 10,
    year: '2019',
    role: 'Finance Director, China',
    company: 'WeWork',
    location: 'Shanghai, China',
    description:
      'Relocated to Shanghai to restructure WeWork China\'s ailing business — optimising operations and financial performance during a critical turnaround phase.',
    image: '/api/drive-image?id=1uB3QSGgAJZ1ODNdC_tppwkkeNbv-sw8M',
    gradient: 'linear-gradient(160deg, #05101a 0%, #0f2a3d 55%, #05101a 100%)',
  },
  {
    id: 11,
    year: '2020',
    role: 'Acting Head of Financial Planning & Analysis',
    company: 'Wizz Air',
    location: 'Budapest, Hungary',
    description:
      'Returned to Budapest during COVID and joined Wizz Air to stabilise the FP&A team and implement data-driven financial strategies amid industry turmoil — navigating the airline through one of aviation\'s most turbulent periods.',
    image: '/api/drive-image?id=1bzsdI3Zo7HDBUMOjdQj-3Fp6S1VTPXZL',
    gradient: 'linear-gradient(160deg, #0f0520 0%, #2d0f60 55%, #0f0520 100%)',
  },
  {
    id: 12,
    year: '2022',
    role: 'Financial Planning & Analysis Manager - Mobility',
    company: 'NEOM',
    location: 'Tabuk, Saudi Arabia',
    description:
      'Joined NEOM — the world\'s most ambitious gigaproject — in Saudi Arabia, bringing expertise in cross-border deal-making and complex financial modelling to one of the largest infrastructure programmes ever undertaken.',
    image: '/api/drive-image?id=1Jrc0CwgbeeX-E7jJYSq02xpRDfxatg_L',
    gradient: 'linear-gradient(160deg, #1a1205 0%, #4a3205 55%, #1a1205 100%)',
  },
  {
    id: 13,
    year: '2025',
    role: 'Head of Sector Strategic Planning',
    company: 'NEOM',
    location: 'Tabuk, Saudi Arabia',
    description:
      'Promoted to Head of Sector Strategic Planning, leading a team to oversee business case processes for NEOM\'s economic sectors — energy, data centres, mobility — and driving multi-billion-dollar investment decisions.',
    image: '/api/drive-image?id=1nmq1gBt5qB38pAQdwGCjPA8ybCHKCAxg',
    gradient: 'linear-gradient(160deg, #1a0e02 0%, #5a3808 55%, #1a0e02 100%)',
  },
  {
    id: 14,
    year: '2026',
    role: 'Head of Sector Strategic Planning',
    company: 'NEOM',
    location: 'Tabuk, Saudi Arabia',
    description:
      'Played a key role in NEOM\'s first-ever board-approved business case — challenging the infrastructure capex programme and prioritising economic sector initiatives to ensure alignment with PIF\'s funding constraints.',
    image: '/api/drive-image?id=1uL5KS1aAYjSiP6NjqpPZhUUkisjgbVa1',
    gradient: 'linear-gradient(160deg, #0d0d0d 0%, #1f1a05 55%, #0d0d0d 100%)',
  },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function CareerTimeline() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [timelineVisible, setTimelineVisible] = useState(false);
  // Track image IDs that failed to load — fall back to gradient for those
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleImageError = (id: number) =>
    setFailedImages((prev) => { const next = new Set(prev); next.add(id); return next; });

  // Track which milestone section is in the viewport
  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    sectionRefs.current.forEach((section, index) => {
      if (!section) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveIndex(index);
        },
        { threshold: 0.45 }
      );
      obs.observe(section);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  // Track whether the overall timeline block is visible (for side indicator)
  useEffect(() => {
    if (!wrapperRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => setTimelineVisible(entry.isIntersecting),
      { threshold: 0.05 }
    );
    obs.observe(wrapperRef.current);
    return () => obs.disconnect();
  }, []);

  const scrollToMilestone = (index: number) => {
    sectionRefs.current[index]?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      {/* ── Section header (white, above dark timeline) ── */}
      <div className="py-24 text-center bg-white">
        <p className="text-xs font-light tracking-[0.35em] text-gray-400 uppercase mb-3">
          2004 — present
        </p>
        <h2 className="font-serif text-4xl md:text-5xl font-medium text-gray-900">
          Career Timeline
        </h2>
        <div className="mt-5 mx-auto w-10 h-px bg-gold-500" />
      </div>

      {/* ── Timeline milestones ── */}
      <div ref={wrapperRef} className="relative">

        {/* Fixed right-side progress indicator */}
        <div
          className={`hidden lg:flex fixed right-10 top-1/2 -translate-y-1/2 z-40 flex-col items-end gap-[10px] transition-opacity duration-500 ${
            timelineVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Vertical connecting line */}
          <div className="absolute right-[5px] top-0 bottom-0 w-px bg-white/20" />

          {milestones.map((milestone, index) => (
            <button
              key={milestone.id}
              onClick={() => scrollToMilestone(index)}
              aria-label={`Jump to ${milestone.year}`}
              className="relative flex items-center gap-3 group"
            >
              {/* Year label — appears for active, fades in on hover for others */}
              <span
                className={`text-[10px] font-light tracking-widest text-white transition-all duration-300 ${
                  activeIndex === index
                    ? 'opacity-80 translate-x-0'
                    : 'opacity-0 translate-x-2 group-hover:opacity-60 group-hover:translate-x-0'
                }`}
              >
                {milestone.year}
              </span>

              {/* Dot */}
              <span
                className={`relative z-10 block rounded-full border transition-all duration-300 ${
                  activeIndex === index
                    ? 'w-3 h-3 border-white bg-white'
                    : 'w-2 h-2 border-white/50 bg-transparent group-hover:border-white'
                }`}
              />
            </button>
          ))}
        </div>

        {/* Milestone full-screen sections */}
        {milestones.map((milestone, index) => {
          const isActive = activeIndex === index;
          return (
            <section
              key={milestone.id}
              ref={(el) => { sectionRefs.current[index] = el; }}
              className="relative min-h-screen flex items-center justify-center overflow-hidden"
            >
              {/* Background: image (with gradient fallback on error) or gradient */}
              {milestone.image && !failedImages.has(milestone.id) ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={milestone.image}
                    alt={`${milestone.role} background`}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={() => handleImageError(milestone.id)}
                  />
                  <div className="absolute inset-0 bg-black/55" />
                </>
              ) : (
                <div
                  className="absolute inset-0"
                  style={{ background: milestone.gradient }}
                />
              )}

              {/* Noise texture overlay for depth */}
              <div className="absolute inset-0 opacity-[0.04] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iLjc1IiBzdGl0Y2hUaWxlcz0ic3RpdGNoIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ic2F0dXJhdGUiIHZhbHVlcz0iMCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIiBmaWx0ZXI9InVybCgjYSkiIG9wYWNpdHk9IjEiLz48L3N2Zz4=')]" />

              {/* Milestone number (ghostly) */}
              <span className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                <span className="font-serif text-[22vw] font-bold text-white/[0.04] leading-none">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </span>

              {/* Content */}
              <div
                className={`milestone-content relative z-10 text-center text-white px-8 max-w-2xl mx-auto ${
                  isActive ? 'is-visible' : ''
                }`}
              >
                {/* Year */}
                <p className="text-6xl md:text-8xl font-serif font-light tracking-wider text-white/30">
                  {milestone.year}
                </p>

                {/* Accent line */}
                <div className="mt-4 mb-6 mx-auto w-12 h-px bg-gold-400" />

                {/* Role */}
                <h3 className="text-2xl md:text-3xl font-light tracking-[0.12em] uppercase">
                  {milestone.role}
                </h3>

                {/* Company · location */}
                <p className="mt-3 text-sm font-light tracking-widest text-white/60 uppercase">
                  {milestone.company}&nbsp; · &nbsp;{milestone.location}
                </p>

                {/* Description */}
                <p className="mt-6 text-base md:text-lg font-light text-white/80 leading-relaxed max-w-lg mx-auto">
                  {milestone.description}
                </p>
              </div>

              {/* Subtle scroll hint on first milestone */}
              {index === 0 && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/40 animate-bounce">
                  <span className="text-[10px] tracking-widest uppercase font-light">Scroll</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 11.5L2 5.5h12L8 11.5z" />
                  </svg>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
