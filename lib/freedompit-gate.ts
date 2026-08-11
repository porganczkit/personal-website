import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Server-side access gate for /freedompit. Server-side on purpose: a check in
// the browser would ship the game to everyone and be bypassed from the console.
//
// The cookie never holds the password — it holds an HMAC derived from it, so a
// stolen cookie does not reveal the secret, and changing FREEDOM_PIT_PASSWORD
// invalidates every cookie already issued.
// ─────────────────────────────────────────────────────────────────────────────

export const GATE_COOKIE = 'fp_access';
const TOKEN_PAYLOAD = 'freedompit-access-v1';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret(): string | null {
  const value = process.env.FREEDOM_PIT_PASSWORD;
  return value && value.length > 0 ? value : null;
}

/** False when FREEDOM_PIT_PASSWORD is unset — in which case we fail closed. */
export function isConfigured(): boolean {
  return secret() !== null;
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on a length mismatch, so compare hashes of equal
  // width instead — that keeps the comparison constant-time for any input.
  const hashA = crypto.createHash('sha256').update(bufA).digest();
  const hashB = crypto.createHash('sha256').update(bufB).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function expectedToken(): string | null {
  const value = secret();
  if (!value) return null;
  return crypto.createHmac('sha256', value).update(TOKEN_PAYLOAD).digest('hex');
}

export function passwordMatches(candidate: unknown): boolean {
  const value = secret();
  if (!value || typeof candidate !== 'string') return false;
  return constantTimeEquals(candidate, value);
}

export function tokenIsValid(token: unknown): boolean {
  const expected = expectedToken();
  if (!expected || typeof token !== 'string') return false;
  return constantTimeEquals(token, expected);
}

export function buildCookie(token: string, secure: boolean): string {
  return [
    `${GATE_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${COOKIE_MAX_AGE}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}
