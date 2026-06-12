import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Voice OUT — text-to-speech via ElevenLabs (cloned voice).
 *
 * Streams MP3 audio of the avatar's reply, spoken in Tibor's cloned voice.
 * Requires two environment variables:
 *   ELEVENLABS_API_KEY   — your ElevenLabs API key
 *   ELEVENLABS_VOICE_ID  — the id of your cloned voice
 *
 * If either is missing, returns 501 so the client falls back to the browser's
 * built-in (OS) voice — nothing breaks before the clone is set up.
 */

// Highest-fidelity multilingual model. Swap to 'eleven_turbo_v2_5' for lower
// latency / cost if needed.
const MODEL = 'eleven_multilingual_v2';
const MAX_CHARS = 2000;

// Simple in-memory rate limiter (per serverless instance).
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string, max = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voiceId) {
    // Not configured yet — signal the client to use the browser fallback voice.
    return res.status(501).json({ error: 'voice-not-configured' });
  }

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests — give it a moment.' });
  }

  const text = (req.body?.text ?? '').toString().trim().slice(0, MAX_CHARS);
  if (!text) return res.status(400).json({ error: 'No text to speak.' });

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': key,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: MODEL,
          voice_settings: {
            // Lower stability = more pitch/intonation variation (less monotone).
            stability: 0.3,
            similarity_boost: 0.85,
            // Style adds expressiveness/emphasis. Raise toward 0.5 for more drama.
            style: 0.4,
            use_speaker_boost: true,
            // Speaking rate (0.7–1.2; 1.0 = default).
            speed: 1.0,
          },
        }),
      }
    );

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      return res
        .status(502)
        .json({ error: `TTS error (${upstream.status}). ${detail.slice(0, 200)}` });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');

    const reader = upstream.body.getReader();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (!res.headersSent) {
      res.status(500).json({ error: `Speech failed: ${message}` });
    } else {
      res.end();
    }
  }
}
