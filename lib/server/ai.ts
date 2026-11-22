export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

/** Provider-agnostic: any OpenAI-compatible chat completions API (Gemini, Groq, OpenAI, OpenRouter...). */
export function aiConfig() {
  const key = process.env.AI_API_KEY || '';
  const model = process.env.AI_MODEL || '';
  const base = (process.env.AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, '');
  return { key, model, base, ok: Boolean(key && model) };
}

async function call(messages: ChatMsg[], opts: { json: boolean; temperature: number; maxTokens: number }, withFormat: boolean) {
  const cfg = aiConfig();
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
  };
  if (opts.json && withFormat) body.response_format = { type: 'json_object' };
  return fetch(`${cfg.base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify(body),
  });
}

export async function chat(
  messages: ChatMsg[],
  opts: { json?: boolean; temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const o = { json: opts.json ?? false, temperature: opts.temperature ?? 0.3, maxTokens: opts.maxTokens ?? 1500 };
  let res = await call(messages, o, true);
  if (res.status === 400 && o.json) res = await call(messages, o, false);
  if (!res.ok) throw new Error('ai_' + res.status);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

export function parseJson<T>(text: string): T | null {
  const cleaned = text.replace(/```json|```/gi, '').trim();
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  if (a === -1 || b === -1) return null;
  try {
    return JSON.parse(cleaned.slice(a, b + 1)) as T;
  } catch {
    return null;
  }
}

export type Seg = { speaker: string; text: string; t: number };

/** Turns transcript segments into compact text, keeping the most recent part when too long. */
export function transcriptText(segs: Seg[], maxChars = 24000) {
  const clean = segs
    .filter((s) => s && typeof s.text === 'string' && s.text.trim())
    .slice(-600)
    .map((s) => {
      const sec = Math.max(0, Math.floor((Number(s.t) || 0) / 1000));
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      return `[${mm}:${ss}] ${String(s.speaker).slice(0, 40)}: ${s.text.trim().slice(0, 600)}`;
    });
  let out = clean.join('\n');
  if (out.length > maxChars) out = out.slice(out.length - maxChars);
  return out;
}
