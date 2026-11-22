import { authMember } from '@/lib/server/auth';
import { aiConfig, chat, parseJson, transcriptText, type Seg } from '@/lib/server/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Host Copilot: private, host-only live suggestions. */
export async function POST(req: Request) {
  const auth = authMember(req, 12);
  if ('error' in auth) return auth.error;
  if (!auth.member.isHost) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (!aiConfig().ok) return Response.json({ error: 'ai_not_configured' }, { status: 503 });

  let body: { transcript?: Seg[]; topics?: string[]; elapsedMin?: number; hosts?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const text = transcriptText(Array.isArray(body.transcript) ? body.transcript : [], 9000);
  if (text.length < 30) return Response.json({ error: 'too_short' }, { status: 422 });

  const topics = (Array.isArray(body.topics) ? body.topics : []).map((t) => String(t).slice(0, 60)).slice(0, 10);
  const hosts = (Array.isArray(body.hosts) ? body.hosts : []).map((h) => String(h).slice(0, 40)).slice(0, 6);
  const elapsed = Math.max(0, Math.round(Number(body.elapsedMin) || 0));

  const system = `You are a private coach for the host of a live interview or meeting. You see the transcript so far (speech-to-text, may contain errors).
Hosts: ${hosts.join(', ') || 'unknown'}. Elapsed: ${elapsed} minutes.
Topics the host wants to cover: ${topics.join('; ') || 'none given'}.
Reply with ONE valid JSON object only:
{
  "nextQuestions": string[],      // 1 to 3 specific follow-up questions based on the latest answers
  "tips": string[],               // 0 to 3 short coaching tips about how the HOST is running the conversation (talk time, interrupting, leading questions, pacing). Only if the transcript supports them
  "coverage": { "topic": string, "covered": boolean }[]   // one entry per topic given; covered only if clearly discussed
}
Be concrete and brief. Never invent what people said. Match the language of the transcript.`;

  try {
    const out = await chat(
      [
        { role: 'system', content: system },
        { role: 'user', content: `TRANSCRIPT (latest part)\n${text}` },
      ],
      { json: true, temperature: 0.4, maxTokens: 900 },
    );
    const parsed = parseJson<Record<string, unknown>>(out);
    if (!parsed) return Response.json({ error: 'ai_bad_output' }, { status: 502 });
    return Response.json({ result: parsed });
  } catch {
    return Response.json({ error: 'ai_failed' }, { status: 502 });
  }
}
