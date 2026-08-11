import type { GetServerSideProps, NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import PasswordGate from '../components/freedom-pit/PasswordGate';
import { GATE_COOKIE, isConfigured, tokenIsValid } from '../lib/freedompit-gate';

// Loaded only once the gate has opened, so a locked-out visitor never downloads
// the game at all.
const FreedomPit = dynamic(() => import('../components/freedom-pit/FreedomPit'), {
  ssr: false,
  loading: () => <div className="min-h-[60vh]" />,
});

interface Props {
  unlocked: boolean;
  configured: boolean;
}

const FreedomPitPage: NextPage<Props> = ({ unlocked, configured }) => {
  return (
    <>
      <Head>
        <title>Freedom Pit — a game</title>
        <meta
          name="description"
          content="Fill the trench, beat the wind, dodge the scorpions and pay off the foremen. A small browser game."
        />
        {/*
          Unlisted and gated: nothing on the site links here, search engines are
          asked to keep it out of the index, and the page itself is behind a
          password checked on the server.
        */}
        <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
        <meta name="googlebot" content="noindex, nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="min-h-screen bg-[#14100a] pb-20">
        {!unlocked ? (
          <PasswordGate configured={configured} />
        ) : (
          <>
            <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
              <Link
                href="/"
                className="text-xs font-light uppercase tracking-[0.25em] text-white/40 transition-colors hover:text-gold-400"
              >
                ← Tibor
              </Link>
              <span className="text-xs font-light uppercase tracking-[0.25em] text-white/30">
                Freedom Pit
              </span>
            </header>

            <FreedomPit />

            <section className="mx-auto mt-16 max-w-2xl px-6 text-center">
              <h2 className="font-serif text-2xl font-medium text-white/90">How it works</h2>
              <div className="mx-auto mt-4 h-px w-10 bg-gold-500" />
              <div className="mt-6 space-y-4 text-sm font-light leading-relaxed text-white/60">
                <p>
                  You are filling a trench on a giga-project, and the quota is the only thing
                  between you and your passport. The Freedom Timer measures sand{' '}
                  <em>currently in the pit</em>, not sand you have ever shifted — which is why the
                  wind matters. It takes about a quarter of everything you move, and more during a
                  gust.
                </p>
                <p>
                  Scorpions rear up before they strike; that pause is your window to either
                  sidestep or swing. Foremen cost 180 coins to wave through. Refuse one and your
                  quota goes up by 20 m³, and you watch the bar you have been filling shrink. Fill
                  30% of it and they will put you in a truck — twelve times the load, but a
                  six-second wait at the hopper with nothing but a windscreen between you and the
                  sand.
                </p>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res }) => {
  // Never let a CDN or shared cache hold a page that depends on a private cookie.
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const configured = isConfigured();
  return {
    props: {
      configured,
      unlocked: configured && tokenIsValid(req.cookies[GATE_COOKIE]),
    },
  };
};

export default FreedomPitPage;
