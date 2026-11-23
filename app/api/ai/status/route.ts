import { AiError, aiConfig, chat } from '@/lib/server/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** GET /api/ai/status -> is a key set. GET /api/ai/status?test=1 -> makes one tiny real call and shows the provider's exact error. */
export async function GET(req: Request) {
  const cfg = aiConfig();
  const out: Record<string, unknown> = { configured: cfg.ok, model: cfg.model || null, provider: cfg.isGemini ? 'gemini' : cfg.base };
  if (new URL(req.url).searchParams.get('test') === '1' && cfg.ok) {
    try {
      const r = await chat([{ role: 'user', content: 'Reply with the single word: ok' }], { maxTokens: 20 });
      out.test = { ok: true, reply: r.trim().slice(0, 40) };
    } catch (e) {
      out.test = { ok: false, status: e instanceof AiError ? e.status : 0, error: e instanceof AiError ? e.detail : 'failed' };
    }
  }
  return Response.json(out);
}
