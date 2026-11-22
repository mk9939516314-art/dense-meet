'use client';

import { useEffect, useRef, useState } from 'react';

type Opts = {
  enabled: boolean;
  lang: string;
  onFinal: (text: string) => void;
  onInterim?: (text: string) => void;
};

/**
 * Transcribes the local user's own speech with the browser's built-in speech recognition.
 * Each person transcribes only themselves, so speaker names are always exact and no audio is sent to a server.
 */
export function useTranscription({ enabled, lang, onFinal, onInterim }: Opts) {
  const [supported, setSupported] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const cb = useRef({ onFinal, onInterim });
  cb.current = { onFinal, onInterim };

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    if (!enabled) {
      cb.current.onInterim?.('');
      return;
    }
    const w = window as unknown as Record<string, any>;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;

    let stopped = false;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = String(r[0]?.transcript || '').trim();
        if (r.isFinal) {
          if (t) cb.current.onFinal(t);
        } else {
          interim += t + ' ';
        }
      }
      cb.current.onInterim?.(interim.trim());
    };
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stopped = true;
        setBlocked(true);
      }
    };
    rec.onend = () => {
      cb.current.onInterim?.('');
      if (!stopped) {
        setTimeout(() => {
          if (stopped) return;
          try {
            rec.start();
          } catch {
            /* already started */
          }
        }, 350);
      }
    };
    try {
      rec.start();
    } catch {
      /* already started */
    }
    return () => {
      stopped = true;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    };
  }, [enabled, lang]);

  return { supported, blocked };
}
