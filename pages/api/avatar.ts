import type { NextApiRequest, NextApiResponse } from 'next';
import { TIBOR_SYSTEM_PROMPT } from '../../lib/tibor-persona';

/**
 * Tibor AI Avatar — streaming chat endpoint (Mistral API).
 *
 * Proxies the conversation to the Mistral API server-side so the API key never
 * reaches the browser. Streams the reply back as plain text chunks.
 *
 * Requires the MISTRAL_API_KEY environment variable (set in Vercel → Project
 * Settings → Environment Variables; locally in .env.local).
 */

// The model powering the avatar. mistral-small-latest is fast and cost-effective
// for a public bot; bump to 'mistral-large-latest' for richer answers. One line.
const MODEL = 'mistral-small-latest';
const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';

// Guard-rails so an open bot on a public domain can't run up a surprise bill.
const MAX_MESSAGE_CHARS = 2000; // per user message
const MAX_HISTORY = 20; // most recent messages kept
const MAX_TOKENS = 1024;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 15; // requests per IP per window

// Simple in-memory rate limiter. Resets when the serverless instance recycles —
// good enough to blunt abuse; swap for a shared store (e.g. Upstash) if needed.
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

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function sanitize(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input)) return null;
  const cleaned: ChatMessage[] = [];
  for (const m of input) {
    if (!m || typeof m !== 'object') return null;
    const role = (m as ChatMessage).role;
    const content = (m as ChatMessage).content;
    if (role !== 'user' && role !== 'assistant') return null;
    if (typeof content !== 'string') return null;
    const trimmed = content.trim();
    if (!trimmed) continue;
    cleaned.push({ role, content: trimmed.slice(0, MAX_MESSAGE_CHARS) });
  }
  // Conversation must start with a user turn and end with one.
  const start = cleaned.findIndex((m) => m.role === 'user');
  if (start === -1) return null;
  const trimmedHistory = cleaned.slice(start).slice(-MAX_HISTORY);
  if (trimmedHistory[trimmedHistory.length - 1]?.role !== 'user') return null;
  return trimmedHistory;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.MISTRAL_API_KEY) {
    return res
      .status(500)
      .json({ error: 'The avatar is not configured yet (missing API key).' });
  }

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';

  if (rateLimited(ip)) {
    return res
      .status(429)
      .json({ error: 'A few too many messages — give it a moment and try again.' });
  }

  const messages = sanitize(req.body?.messages);
  if (!messages) {
    return res.status(400).json({ error: 'Invalid conversation payload.' });
  }

  try {
    const upstream = await fetch(MISTRAL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        stream: true,
        // Mistral takes the system prompt as the first message (OpenAI-style).
        messages: [{ role: 'system', content: TIBOR_SYSTEM_PROMPT }, ...messages],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      return res
        .status(502)
        .json({ error: `Avatar upstream error (${upstream.status}). ${detail.slice(0, 200)}` });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');

    // Parse the Mistral SSE stream and forward only the text deltas.
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep the last partial line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) res.write(delta);
        } catch {
          /* ignore keep-alive / non-JSON lines */
        }
      }
    }

    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (!res.headersSent) {
      res.status(500).json({ error: `Avatar error: ${message}` });
    } else {
      res.end();
    }
  }
}
