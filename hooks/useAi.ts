'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CopilotResult, MeetingSummary, TxSeg } from '@/lib/types';

type TokenRef = { current: string };

export type AiError = 'not_configured' | 'too_short' | 'failed' | 'busy' | null;
export const AI_RETRY_NOTE = 'The AI provider returned an error. The host can open /api/ai/status?test=1 to see exactly why.';

function toSegs(tx: TxSeg[], startedAt: number) {
  return tx.map((s) => ({ speaker: s.speaker, text: s.text, t: Math.max(0, s.ts - startedAt) }));
}

async function post<T>(path: string, token: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: AiError; detail?: string }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true, data: (await res.json()) as T };
    if (res.status === 503) return { ok: false, error: 'not_configured' };
    if (res.status === 422) return { ok: false, error: 'too_short' };
    if (res.status === 429) return { ok: false, error: 'busy' };
    const j = (await res.json().catch(() => ({}))) as { detail?: string };
    return { ok: false, error: 'failed', detail: j.detail };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

export function useAiStatus() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    fetch('/api/ai/status')
      .then((r) => r.json())
      .then((d) => setConfigured(Boolean(d.configured)))
      .catch(() => setConfigured(false));
  }, []);
  return configured;
}

export function useCopilot(token: TokenRef, tx: TxSeg[], startedAt: number, enabled: boolean, topics: string[], hosts: string[]) {
  const [result, setResult] = useState<CopilotResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AiError>(null);
  const lastCount = useRef(0);
  const lastAt = useRef(0);
  const busy = useRef(false);
  const txRef = useRef(tx);
  txRef.current = tx;

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    lastAt.current = Date.now();
    lastCount.current = txRef.current.length;
    const r = await post<{ result: CopilotResult }>('/api/ai/copilot', token.current, {
      transcript: toSegs(txRef.current.slice(-80), startedAt),
      topics,
      hosts,
      elapsedMin: (Date.now() - startedAt) / 60000,
    });
    if (r.ok) {
      setResult(r.data.result);
      setError(null);
    } else {
      setError(r.error);
    }
    setLoading(false);
    busy.current = false;
  }, [token, startedAt, topics, hosts]);

  // Auto refresh every ~45s when there are at least 4 new sentences.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (txRef.current.length - lastCount.current >= 4 && Date.now() - lastAt.current > 45000) refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  return { result, loading, error, refresh };
}

export function useSummary(token: TokenRef, tx: TxSeg[], startedAt: number) {
  const [result, setResult] = useState<MeetingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AiError>(null);

  const generate = useCallback(
    async (mode: 'interview' | 'meeting', hosts: string[], criteria: string[]) => {
      setLoading(true);
      setError(null);
      const r = await post<{ result: MeetingSummary }>('/api/ai/summary', token.current, {
        mode,
        hosts,
        criteria,
        transcript: toSegs(tx, startedAt),
      });
      if (r.ok) setResult(r.data.result);
      else setError(r.error);
      setLoading(false);
    },
    [token, tx, startedAt],
  );

  return { result, loading, error, generate };
}

export type HelperMsg = { role: 'user' | 'assistant'; content: string };

export function useHelper(token: TokenRef) {
  const [messages, setMessages] = useState<HelperMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AiError>(null);
  const [detail, setDetail] = useState('');

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || loading) return;
      const history = messages.slice(-6);
      setMessages((m) => [...m, { role: 'user', content: q }]);
      setLoading(true);
      setError(null);
      const r = await post<{ answer: string }>('/api/ai/helper', token.current, { question: q, history });
      if (r.ok) setMessages((m) => [...m, { role: 'assistant', content: r.data.answer || 'I could not find an answer to that.' }]);
      else {
        setError(r.error);
        setDetail(r.detail || '');
      }
      setLoading(false);
    },
    [token, messages, loading],
  );

  return { messages, loading, error, detail, ask };
}
