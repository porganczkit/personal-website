import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Voice IN — speech-to-text via Mistral Voxtral.
 *
 * Receives raw audio (recorded by the browser's MediaRecorder) as the request
 * body and forwards it to Mistral's transcription API. Works in every browser
 * (including Firefox), unlike the browser Web Speech API.
 *
 * Reuses the existing MISTRAL_API_KEY environment variable.
 */

// Disable Next's JSON body parser so we can read the raw audio bytes.
export const config = { api: { bodyParser: false } };

const MISTRAL_URL = 'https://api.mistral.ai/v1/audio/transcriptions';
const MODEL = 'voxtral-mini-latest';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB

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
  if (!process.env.MISTRAL_API_KEY) {
    return res.status(500).json({ error: 'Transcription is not configured.' });
  }

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests — give it a moment.' });
  }

  try {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      total += (chunk as Buffer).length;
      if (total > MAX_AUDIO_BYTES) {
        return res.status(413).json({ error: 'Audio too large.' });
      }
      chunks.push(Buffer.from(chunk as Buffer));
    }
    const buf = Buffer.concat(chunks);
    if (!buf.length) return res.status(400).json({ error: 'No audio received.' });

    const contentType = (req.headers['content-type'] as string) || 'audio/webm';
    const ext = contentType.includes('mp4')
      ? 'mp4'
      : contentType.includes('ogg')
        ? 'ogg'
        : contentType.includes('wav')
          ? 'wav'
          : 'webm';

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buf)], { type: contentType }), `audio.${ext}`);
    form.append('model', MODEL);

    const upstream = await fetch(MISTRAL_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
      body: form,
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return res
        .status(502)
        .json({ error: `Transcription error (${upstream.status}). ${detail.slice(0, 200)}` });
    }

    const data = (await upstream.json()) as { text?: string };
    return res.status(200).json({ text: (data?.text ?? '').trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: `Transcription failed: ${message}` });
  }
}
