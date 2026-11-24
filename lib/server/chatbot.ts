import { aiConfig } from './ai';

export type ChatTurn = { role: 'system' | 'user' | 'assistant'; content: string };

const clean = (v?: string) => (v || '').trim().replace(/^["']|["']$/g, '');

/**
 * The chatbot uses its own provider (CHAT_*), so it never competes with the in-meeting AI for quota.
 * Any OpenAI-compatible API works, for example https://freemodel.in/v1. If no CHAT_* key is set, it falls back to the AI_* provider.
 */
export function chatConfig() {
  const own = clean(process.env.CHAT_API_KEY);
  if (own) {
    const base = (clean(process.env.CHAT_BASE_URL) || 'https://freemodel.in/v1').replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
    return { key: own, base, model: clean(process.env.CHAT_MODEL), own: true, ok: true };
  }
  const a = aiConfig();
  return { key: a.key, base: a.base, model: a.model, own: false, ok: a.ok };
}

let found: { base: string; ids: string[]; at: number } | null = null;

async function listModels(cfg: ReturnType<typeof chatConfig>) {
  if (found && found.base === cfg.base && Date.now() - found.at < 10 * 60_000) return found.ids;
  try {
    const res = await fetch(`${cfg.base}/models`, { headers: { Authorization: `Bearer ${cfg.key}`, 'x-goog-api-key': cfg.key } });
    if (!res.ok) return [];
    const j = (await res.json()) as { data?: { id: string }[] };
    const ids = (j.data || []).map((d) => String(d.id)).filter((id) => !/embed|whisper|tts|image|dall|moderation|rerank|speech|audio|vision-only|sdxl|flux|stable/i.test(id));
    found = { base: cfg.base, ids, at: Date.now() };
    return ids;
  } catch {
    return [];
  }
}

function rank(id: string) {
  const s = id.toLowerCase();
  let n = 0;
  // Speed matters most in a chat widget: prefer small, fast models of the good families.
  if (/gpt-5|gpt-4\.1|gpt-4o|claude|gemini|llama-?3\.[1-9]|llama-?4|deepseek|qwen|mistral|grok/.test(s)) n += 3;
  if (/flash|mini|haiku|instant|turbo|nano|small|8b|9b|lite/.test(s)) n += 4;
  if (/chat|instruct/.test(s)) n += 1;
  if (/opus|ultra|pro\b|405b|120b|70b|reason|think|o1|o3|r1/.test(s)) n -= 4;
  if (/preview|exp|beta|old/.test(s)) n -= 1;
  return n;
}

export async function pickModels(cfg: ReturnType<typeof chatConfig>, exclude: string[] = []) {
  const ids = (await listModels(cfg)).filter((i) => !exclude.includes(i));
  return ids.sort((a, b) => rank(b) - rank(a)).slice(0, 4);
}

export class ChatError extends Error {
  constructor(public status: number, public detail: string) {
    super(`chat_${status}`);
  }
}

async function detail(res: Response) {
  const raw = await res.text().catch(() => '');
  try {
    const j = JSON.parse(raw);
    const e = Array.isArray(j) ? j[0] : j;
    return String(e?.error?.message || e?.message || e?.detail || raw).slice(0, 300);
  } catch {
    return raw.slice(0, 300);
  }
}

async function open(cfg: ReturnType<typeof chatConfig>, model: string, messages: ChatTurn[], signal: AbortSignal, stream: boolean) {
  const body: Record<string, unknown> = { model, messages, temperature: 0.4, max_tokens: 900, stream };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 60_000);
  const onAbort = () => ctl.abort();
  signal.addEventListener('abort', onAbort);
  try {
    return await fetch(`${cfg.base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}`, 'x-goog-api-key': cfg.key },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(t);
    signal.removeEventListener('abort', onAbort);
  }
}

/** Opens a response from the provider, trying streaming first, then other models if this one is gone. */
export async function openChat(messages: ChatTurn[], signal: AbortSignal) {
  const cfg = chatConfig();
  if (!cfg.ok) throw new ChatError(503, 'not_configured');
  const tried: string[] = [];
  let models = cfg.model ? [cfg.model] : await pickModels(cfg);
  if (!models.length) models = ['gpt-4o-mini'];
  let last: ChatError | null = null;
  for (let i = 0; i < models.length && i < 5; i++) {
    const model = models[i];
    tried.push(model);
    for (const stream of [true, false]) {
      let res: Response;
      try {
        res = await open(cfg, model, messages, signal, stream);
      } catch {
        last = new ChatError(504, 'The chat provider did not respond in time.');
        continue;
      }
      if (res.ok) return { res, model, stream };
      const d = await detail(res);
      last = new ChatError(res.status, d);
      if (res.status === 401 || res.status === 403) throw last;
      if (res.status === 429) throw last;
      if (res.status === 400 && stream && /stream/i.test(d)) continue;
      break;
    }
    if (i === 0 && !cfg.model) continue;
    if (i === 0 && cfg.model && last && [400, 404].includes(last.status)) {
      const more = await pickModels(cfg, tried);
      models = [...models, ...more];
    }
  }
  throw last || new ChatError(502, 'No model answered.');
}

/** Turns the provider's reply (event stream or plain JSON) into a plain text stream for the browser. */
export function toTextStream(res: Response, streaming: boolean) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  if (!streaming || !res.body) {
    return new ReadableStream<Uint8Array>({
      async start(c) {
        try {
          const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          c.enqueue(enc.encode(j.choices?.[0]?.message?.content || ''));
        } catch {
          /* empty */
        }
        c.close();
      },
    });
  }
  const reader = res.body.getReader();
  let buf = '';
  let sent = false;
  return new ReadableStream<Uint8Array>({
    async pull(c) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          if (!sent && buf.trim()) {
            try {
              const j = JSON.parse(buf);
              const t = j.choices?.[0]?.message?.content;
              if (t) c.enqueue(enc.encode(t));
            } catch {
              /* ignore */
            }
          }
          c.close();
          return;
        }
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        let out = '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const j = JSON.parse(data);
            const t = j.choices?.[0]?.delta?.content;
            if (typeof t === 'string') out += t;
          } catch {
            /* partial or keep-alive */
          }
        }
        if (out) {
          sent = true;
          c.enqueue(enc.encode(out));
          return;
        }
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}
