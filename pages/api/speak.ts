import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Voice OUT — low-latency text-to-speech via ElevenLabs (cloned voice).
 *
 * Uses the ElevenLabs *streaming* endpoint and pipes audio bytes to the client
 * as they're generated, so the browser can start playing almost immediately
 * (instead of waiting for the whole clip). Accepts GET (?text=) so the client
 * can play it via a progressive <audio> element, and POST (json) too.
 *
 * Requires ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID. If either is missing,
 * returns 501 so the client falls back to the browser's built-in OS voice.
 */

// Low-latency model for a real-time chatbot. For max fidelity (slower) use
// 'eleven_multilingual_v2'; for the fastest/cheapest use 'eleven_flash_v2_5'.
const MODEL = 'eleven_turbo_v2_5';
const MAX_CHARS = 2000;

// Simple in-memory rate limiter (per serverless instance).
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string, max = 30, windowMs = 60_000): boolean {
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
  if (req.method !== 'POST' && req.method !== 'GET') {
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

  const raw = req.method === 'GET' ? req.query.text : req.body?.text;
  const text = (typeof raw === 'string' ? raw : '').trim().slice(0, MAX_CHARS);
  if (!text) return res.status(400).json({ error: 'No text to speak.' });

  try {
    // Streaming endpoint + low-latency hint → first audio bytes arrive fast.
    const url =
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream` +
      `?optimize_streaming_latency=3&output_format=mp3_44100_128`;

    const upstream = await fetch(url, {
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
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      return res
        .status(502)
        .json({ error: `TTS error (${upstream.status}). ${detail.slice(0, 200)}` });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');

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
