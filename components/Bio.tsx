// Bio photo Google Drive file IDs.
// Images are proxied through /api/drive-image to avoid browser CORS / ORB blocking.
const driveId = (id: string) => `/api/drive-image?id=${id}`;

const bioPhotos = [
  {
    id: 'photo-1',
    src: driveId('1dWrFgKFv5lSA0_fD5Us5md8eaMqfBCR2'),
    alt: 'Tibor — portrait',
  },
  {
    id: 'photo-2',
    src: driveId('1Iu-rL9yImM3MCa-Gur-SOyZP-fiLwJeS'),
    alt: 'Tibor — photo',
  },
  {
    id: 'photo-3',
    src: driveId('1Qe6ujmw8aXDZHo04rm2PbHAduRxhD1A7'),
    alt: 'Tibor — photo 3',
  },
  {
    id: 'photo-4',
    src: driveId('1_nxnv-tYJ1r5BUegXZLz_0kdoQ_UBDCV'),
    alt: 'Tibor — photo 4',
  },
  {
    id: 'photo-5',
    src: driveId('1QtwM6Fz3QowhhlGr8eqURTno6xeTYT2G'),
    alt: 'Tibor — photo 5',
  },
];

export default function Bio() {
  return (
    <div className="min-h-screen bg-white pt-16">
      <div className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">

          {/* ── Left column: text ── */}
          <div className="lg:sticky lg:top-24 lg:pt-6 animate-fade-in">
            {/* Name */}
            <h1 className="font-serif text-5xl md:text-6xl font-medium text-gray-900 leading-tight">
              Tibor Porgánczki
</h1>

            {/* Title line */}
            <p className="mt-3 text-sm font-light tracking-[0.25em] text-gold-500 uppercase">
              Finance Director &nbsp;·&nbsp; M&amp;A Specialist
            </p>

            {/* Divider */}
            <div className="mt-6 w-10 h-px bg-gray-300" />

            {/* Bio text */}
            <p className="mt-8 text-[1.05rem] text-gray-600 font-light leading-[1.85] tracking-[0.01em]">
              Numbers tell stories — and I&apos;ve spent the last 15 years making sure
              those stories end with success. As Head of M&amp;A, I led due diligence
              and closed real estate services roll-up deals across Europe and
              Asia-Pacific, then monitored their performance to ensure underwritten
              targets were delivered.
            </p>

            <p className="mt-4 text-[1.05rem] text-gray-600 font-light leading-[1.85] tracking-[0.01em]">
              Later, as Finance Director, I built teams, designed financial models,
              and advised on investments that shaped the future of real estate and
              mobility.
            </p>

            <p className="mt-4 text-[1.05rem] text-gray-600 font-light leading-[1.85] tracking-[0.01em]">
              When I&apos;m not crunching numbers, you&apos;ll find me mentoring young
              professionals, tinkering with AI tools, or spending time with my family
              in Budapest, Hungary. If you&apos;re working on something bold, or need
              the expertise of a Middle-East and Asia specialist, let&apos;s talk.
            </p>

            {/* CTA */}
            <a
              href="mailto:ptibor@cantab.net"
              className="inline-block mt-10 px-8 py-3 border border-gray-900 text-gray-900 text-sm font-light tracking-[0.18em] uppercase hover:bg-gray-900 hover:text-white transition-all duration-300"
            >
              Let&apos;s Talk
            </a>

            {/* Location tag */}
            <p className="mt-8 text-xs text-gray-400 font-light tracking-widest uppercase">
              Based in Budapest, Hungary
            </p>
          </div>

          {/* ── Right column: photos ── */}
          <div className="grid grid-cols-2 gap-3">
            {/* Featured portrait — tall, spans two rows on the left */}
            <div
              className="row-span-2 photo-card bg-gray-100 overflow-hidden rounded-xl shadow-sm hover:shadow-md transition-shadow animate-fade-in-up"
              style={{ animationDelay: '120ms', animationFillMode: 'both' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bioPhotos[0].src}
                alt={bioPhotos[0].alt}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>

            {/* Supporting photos */}
            {bioPhotos.slice(1).map((photo, i) => (
              <div
                key={photo.id}
                className="photo-card bg-gray-100 overflow-hidden rounded-xl shadow-sm hover:shadow-md transition-shadow animate-fade-in-up"
                style={{ animationDelay: `${200 + i * 80}ms`, animationFillMode: 'both' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.src}
                  alt={photo.alt}
                  className="w-full aspect-square object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
