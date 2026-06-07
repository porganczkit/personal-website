import { useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// TIBOR AI AVATAR — floating chat widget
// A corner button opens a chat panel that streams replies from /api/avatar.
// ─────────────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const GREETING =
  "Hello — I'm Tibor's AI avatar. Ask me about my career, M&A, finance, or working across Europe, Asia, and the Middle East.";

export default function AvatarChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setError(null);
    const nextMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setStreaming(true);

    // Add an empty assistant message we'll stream into.
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok || !res.body) {
        let msg = 'Something went wrong. Please try again.';
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          /* non-JSON error */
        }
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: acc };
          return copy;
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
      // Drop the empty/partial assistant bubble on hard failure.
      setMessages((prev) => {
        const copy = [...prev];
        if (copy[copy.length - 1]?.role === 'assistant' && !copy[copy.length - 1].content) {
          copy.pop();
        }
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* Launcher button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat' : 'Chat with Tibor'}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-gray-900 px-5 py-3 text-white shadow-lg transition-all duration-300 hover:bg-gray-700 ${
          open ? 'opacity-0 pointer-events-none translate-y-2' : 'opacity-100'
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3a8.5 8.5 0 0 1 8.5 8.5z" />
        </svg>
        <span className="text-sm font-light tracking-wide">Ask Tibor</span>
      </button>

      {/* Chat panel */}
      <div
        className={`fixed bottom-6 right-6 z-50 flex w-[calc(100vw-3rem)] max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 transition-all duration-300 ${
          open ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-4'
        }`}
        style={{ height: 'min(70vh, 560px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-900 font-serif text-sm text-white">
              TP
            </span>
            <div>
              <p className="font-serif text-sm font-medium text-gray-900">Tibor — AI Avatar</p>
              <p className="text-[11px] font-light tracking-wide text-gold-500">
                Finance &amp; M&amp;A
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            className="text-gray-400 transition-colors hover:text-gray-900"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {/* Greeting */}
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-2.5 text-sm font-light leading-relaxed text-gray-700">
              {GREETING}
            </div>
          </div>

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm font-light leading-relaxed ${
                  m.role === 'user'
                    ? 'rounded-tr-sm bg-gray-900 text-white'
                    : 'rounded-tl-sm bg-gray-100 text-gray-700'
                }`}
              >
                {m.content || (
                  <span className="inline-flex gap-1 py-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
                  </span>
                )}
              </div>
            </div>
          ))}

          {error && (
            <p className="text-center text-xs font-light text-red-500">{error}</p>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 px-3 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Ask about my career, M&A, finance…"
              className="no-scrollbar max-h-28 flex-1 resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm font-light text-gray-800 outline-none transition-colors focus:border-gray-400"
            />
            <button
              onClick={send}
              disabled={!input.trim() || streaming}
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white transition-all hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
          <p className="mt-2 px-1 text-center text-[10px] font-light text-gray-400">
            AI avatar of Tibor — may be imperfect. For anything important,{' '}
            <a href="mailto:ptibor@cantab.net" className="underline hover:text-gray-600">
              email the real Tibor
            </a>
            .
          </p>
        </div>
      </div>
    </>
  );
}
