import { useState } from 'react';
import { useRouter } from 'next/router';

export default function PasswordGate({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/freedompit-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // Re-run getServerSideProps so the gate sees the new cookie.
        router.replace(router.asPath);
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(
        body.error === 'too-many-attempts'
          ? 'Too many attempts. Wait a minute and try again.'
          : 'That is not the password.'
      );
    } catch {
      setError('Could not reach the gate. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-serif text-3xl text-white/90">Not configured</h1>
        <p className="mt-4 text-sm font-light leading-relaxed text-white/50">
          This page needs a <code className="text-gold-400">FREEDOM_PIT_PASSWORD</code> environment
          variable before it will let anyone in. It fails closed on purpose.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <p className="mb-3 text-[10px] uppercase tracking-[0.35em] text-gold-400">Private</p>
      <h1 className="font-serif text-4xl font-medium text-white">Freedom Pit</h1>
      <p className="mt-4 text-sm font-light leading-relaxed text-white/50">
        This one is not public yet. If you were given a password, it goes here.
      </p>

      <form onSubmit={submit} className="mt-8">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
          placeholder="Password"
          aria-label="Password"
          className="w-full border border-white/20 bg-white/5 px-4 py-2.5 text-center text-sm text-white placeholder-white/30 outline-none focus:border-gold-400"
        />
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-4 w-full border border-gold-400 px-7 py-2.5 text-sm font-light tracking-wide text-gold-400 transition-colors hover:bg-gold-400 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Checking…' : 'Let me in'}
        </button>
        {error && <p className="mt-4 text-xs text-red-300">{error}</p>}
      </form>

      <a
        href="/"
        className="mt-10 inline-block text-xs font-light uppercase tracking-[0.25em] text-white/30 transition-colors hover:text-gold-400"
      >
        ← Back to the site
      </a>
    </div>
  );
}
