import { useCallback, useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// TIBOR AI AVATAR — floating chat widget with voice
// Text + voice chat that streams replies from /api/avatar.
//   Voice IN  → record with MediaRecorder, transcribe via /api/transcribe
//               (Mistral Voxtral). Works in all browsers, including Firefox.
//   Voice OUT → /api/speak (ElevenLabs cloned voice), with automatic fallback
//               to the browser's built-in voice if cloning isn't configured.
// ─────────────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const GREETING =
  "Hello — I'm Tibor's AI avatar. Ask me about my career, M&A, finance, or working across Europe, Asia, and the Middle East. Tap the mic to talk to me.";

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export default function AvatarChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice state
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceOut, setVoiceOut] = useState(false); // speak replies aloud
  const [speaking, setSpeaking] = useState(false);
  const [micSupported, setMicSupported] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Detect mic capability + prepare a fallback browser voice.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setMicSupported(
      !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
    );

    if ('speechSynthesis' in window) {
      const pick = () => {
        const voices = window.speechSynthesis.getVoices();
        if (!voices.length) return;
        const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
        ttsVoiceRef.current =
          en.find((v) => /(daniel|arthur|george|male|en-gb)/i.test(`${v.name} ${v.lang}`)) ||
          en.find((v) => v.lang.toLowerCase() === 'en-gb') ||
          en[0] ||
          voices[0];
      };
      pick();
      window.speechSynthesis.onvoiceschanged = pick;
    }

    return () => {
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        audioRef.current?.pause();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      } catch {
        /* noop */
      }
    };
  }, []);

  // Stop any audio when the panel closes.
  useEffect(() => {
    if (!open) stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const browserSpeak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    if (ttsVoiceRef.current) utter.voice = ttsVoiceRef.current;
    utter.onstart = () => setSpeaking(true);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utter);
  }, []);

  function stopSpeaking() {
    try {
      audioRef.current?.pause();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {
      /* noop */
    }
    setSpeaking(false);
  }

  // Speak via the cloned voice — plays progressively from the streaming
  // /api/speak endpoint so audio starts almost immediately. Falls back to the
  // browser OS voice on error or if cloning isn't configured (501 → onerror).
  const speak = useCallback(
    (text: string) => {
      if (!text.trim() || typeof window === 'undefined') return;
      stopSpeaking();

      let fellBack = false;
      const fallback = () => {
        if (!fellBack) {
          fellBack = true;
          browserSpeak(text);
        }
      };

      const audio = new Audio(`/api/speak?text=${encodeURIComponent(text.slice(0, 2000))}`);
      audioRef.current = audio;
      audio.onplaying = () => setSpeaking(true);
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => {
        setSpeaking(false);
        fallback();
      };
      audio.play().catch(() => fallback());
    },
    [browserSpeak]
  );

  const send = async (rawText?: string, viaVoice = false) => {
    const text = (rawText ?? input).trim();
    if (!text || streaming) return;

    stopSpeaking();
    setError(null);
    const nextMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setStreaming(true);
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    const shouldSpeak = viaVoice || voiceOut;

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

      if (shouldSpeak) speak(acc);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
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

  // ── Microphone: record → transcribe (Voxtral) → send ──
  const transcribeAndSend = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Transcription failed.');
      const text = (data.text || '').trim();
      if (text) {
        setInput(text);
        send(text, true);
      } else {
        setError("I didn't catch that — please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed.');
    } finally {
      setTranscribing(false);
    }
  };

  const startRecording = async () => {
    stopSpeaking();
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        if (blob.size) transcribeAndSend(blob);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      setError('Microphone access was blocked. Check your browser permissions.');
      setRecording(false);
    }
  };

  const stopRecording = () => {
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      /* noop */
    }
    setRecording(false);
  };

  const toggleMic = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const status = recording
    ? 'Listening…'
    : transcribing
      ? 'Transcribing…'
      : speaking
        ? 'Speaking…'
        : 'Finance & M&A';

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
              <p className="text-[11px] font-light tracking-wide text-gold-500">{status}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Voice-out toggle */}
            <button
              onClick={() => {
                if (voiceOut) stopSpeaking();
                setVoiceOut((v) => !v);
              }}
              aria-label={voiceOut ? 'Mute spoken replies' : 'Hear replies aloud'}
              title={voiceOut ? 'Spoken replies: on' : 'Spoken replies: off'}
              className={`rounded-lg p-2 transition-colors ${
                voiceOut ? 'text-gold-600 hover:text-gold-500' : 'text-gray-400 hover:text-gray-900'
              }`}
            >
              {voiceOut ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M22 9l-6 6M16 9l6 6" />
                </svg>
              )}
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-lg p-2 text-gray-400 transition-colors hover:text-gray-900"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
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

          {error && <p className="text-center text-xs font-light text-red-500">{error}</p>}
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 px-3 py-3">
          <div className="flex items-end gap-2">
            {/* Mic button */}
            {micSupported && (
              <button
                onClick={toggleMic}
                disabled={streaming || transcribing}
                aria-label={recording ? 'Stop recording' : 'Speak to Tibor'}
                className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                  recording
                    ? 'bg-red-500 text-white'
                    : 'border border-gray-200 text-gray-700 hover:border-gray-400'
                }`}
              >
                {recording && (
                  <span className="absolute inline-flex h-10 w-10 animate-ping rounded-xl bg-red-400 opacity-40" />
                )}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
                </svg>
              </button>
            )}

            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={recording ? 'Listening…' : 'Ask about my career, M&A, finance…'}
              className="no-scrollbar max-h-28 flex-1 resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm font-light text-gray-800 outline-none transition-colors focus:border-gray-400"
            />
            <button
              onClick={() => send()}
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
