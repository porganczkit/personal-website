import type { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import { TIBOR_SYSTEM_PROMPT } from '../../lib/tibor-persona';

/**
 * Tibor AI Avatar — streaming chat endpoint.
 *
 * Proxies the conversation to the Claude API server-side so the API key never
 * reaches the browser. Streams the reply back as plain text chunks.
 *
 * Requires the ANTHROPIC_API_KEY environment variable (set in Vercel → Project
 * Settings → Environment Variables; locally in .env.local).
 */

// The model powering the avatar. Haiku is fast and cost-effective for a public
// bot; bump to 'claude-sonnet-4-6' (mid-tier) or 'claude-opus-4-8' (most
// capable) if you want richer answers. Change this one line.
const MODEL = 'claude-haiku-4-5';

// Guard-rails so an open bot on a public domain can't run up a surprise bill.
const MAX_MESSAGE_CHARS = 2000; // per user message
const MAX_HISTORY = 20; // most recent messages kept
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 15; // requests per IP per window

const client = new Anthropic();

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

  if (!process.env.ANTHROPIC_API_KEY) {
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
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: TIBOR_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages,
    });

    stream.on('text', (delta) => {
      res.write(delta);
    });

    await stream.finalMessage();
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // If nothing has been streamed yet we can still send a JSON error.
    if (!res.headersSent) {
      res.status(500).json({ error: `Avatar error: ${message}` });
    } else {
      res.end();
    }
  }
}
