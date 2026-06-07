import type { NextPage } from 'next';
import Head from 'next/head';
import Nav from '../components/Nav';
import Bio from '../components/Bio';
import CareerTimeline from '../components/CareerTimeline';
import AvatarChat from '../components/AvatarChat';

const Home: NextPage = () => {
  return (
    <>
      <Head>
        <title>Tibor | Finance &amp; M&amp;A</title>
        <meta
          name="description"
          content="Head of M&A and Finance Director specialising in real estate and mobility across Europe, Middle East, and Asia-Pacific."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Nav />

      <main>
        <section id="bio">
          <Bio />
        </section>
        <section id="timeline">
          <CareerTimeline />
        </section>
      </main>

      <AvatarChat />
    </>
  );
};

export default Home;
