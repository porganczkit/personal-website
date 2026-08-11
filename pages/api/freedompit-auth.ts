import type { NextApiRequest, NextApiResponse } from 'next';
import {
  buildCookie,
  expectedToken,
  isConfigured,
  passwordMatches,
} from '../../lib/freedompit-gate';

// Simple in-memory rate limiter, matching the pattern in avatar.ts. Resets when
// the serverless instance recycles — enough to stop casual password guessing.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 8; // attempts per IP per minute
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }

  if (!isConfigured()) {
    return res.status(503).json({ ok: false, error: 'not-configured' });
  }

  const forwarded = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded || '').split(',')[0].trim();
  if (rateLimited(ip || 'unknown')) {
    return res.status(429).json({ ok: false, error: 'too-many-attempts' });
  }

  const password = (req.body as { password?: unknown } | undefined)?.password;
  if (!passwordMatches(password)) {
    // Deliberately vague, and no hint about length or format.
    return res.status(401).json({ ok: false, error: 'incorrect' });
  }

  const token = expectedToken();
  if (!token) return res.status(503).json({ ok: false, error: 'not-configured' });

  res.setHeader('Set-Cookie', buildCookie(token, process.env.NODE_ENV === 'production'));
  return res.status(200).json({ ok: true });
}
