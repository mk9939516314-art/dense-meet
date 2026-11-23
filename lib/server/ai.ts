export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

const clean = (v?: string) => (v || '').trim().replace(/^["']|["']$/g, '');

/** Provider-agnostic: any OpenAI-compatible chat completions API (Gemini, Groq, OpenAI, OpenRouter...). */
export function aiConfig() {
  const key = clean(process.env.AI_API_KEY);
  let base = clean(process.env.AI_BASE_URL) || 'https://generativelanguage.googleapis.com/v1beta/openai';
  base = base.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
  const isGemini = base.includes('generativelanguage.googleapis.com');
  let model = clean(process.env.AI_MODEL) || (isGemini ? 'gemini-2.5-flash' : '');
  if (isGemini) model = model.replace(/^models\//, '');
  return { key, model, base, isGemini, ok: Boolean(key && model) };
}

export class AiError extends Error {
  constructor(public status: number, public detail: string) {
    super(`ai_${status}`);
  }
}

async function call(messages: ChatMsg[], opts: { json: boolean; temperature: number; maxTokens: number }, level: 0 | 1 | 2) {
  const cfg = aiConfig();
  const body: Record<string, unknown> = { model: cfg.model, messages, temperature: opts.temperature, max_tokens: opts.maxTokens };
  // level 0: all options. level 1: no JSON mode / no reasoning switch. level 2: bare minimum.
  if (level === 0 && opts.json) body.response_format = { type: 'json_object' };
  if (level === 0 && cfg.isGemini && /2\.5|3/.test(cfg.model)) body.reasoning_effort = 'low';
  if (level === 2) {
    delete body.max_tokens;
    delete body.temperature;
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 45000);
  try {
    return await fetch(`${cfg.base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}`, 'x-goog-api-key': cfg.key },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

async function errorDetail(res: Response) {
  const raw = await res.text().catch(() => '');
  try {
    const j = JSON.parse(raw);
    const e = Array.isArray(j) ? j[0] : j;
    return String(e?.error?.message || e?.message || raw).slice(0, 300);
  } catch {
    return raw.slice(0, 300);
  }
}

export async function chat(
  messages: ChatMsg[],
  opts: { json?: boolean; temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const o = { json: opts.json ?? false, temperature: opts.temperature ?? 0.3, maxTokens: opts.maxTokens ?? 1500 };
  let last: AiError | null = null;
  for (const level of [0, 1, 2] as const) {
    let res: Response;
    try {
      res = await call(messages, o, level);
    } catch (e) {
      throw new AiError(0, e instanceof Error && e.name === 'AbortError' ? 'The AI provider took too long to answer.' : 'Could not reach the AI provider.');
    }
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1200));
      res = await call(messages, o, level).catch(() => res);
    }
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string | null } }[] };
      const text = data.choices?.[0]?.message?.content ?? '';
      if (text.trim()) return text;
      last = new AiError(200, 'The AI returned an empty answer.');
      continue;
    }
    last = new AiError(res.status, await errorDetail(res));
    // Only a 400/422 means "this option is not supported": try again with fewer options. Anything else will not improve.
    if (res.status !== 400 && res.status !== 422) break;
  }
  throw last ?? new AiError(0, 'Unknown AI error.');
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
