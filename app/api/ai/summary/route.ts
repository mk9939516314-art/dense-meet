import { authMember } from '@/lib/server/auth';
import { aiConfig, chat, parseJson, transcriptText, type Seg } from '@/lib/server/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHAPE = `{
  "summary": string,                       // 3-5 sentence overview
  "keyPoints": string[],                   // up to 8
  "decisions": string[],                   // decisions that were actually made
  "actionItems": { "task": string, "owner": string | null }[],
  "people": [{
    "name": string,
    "summary": string,                     // 2-3 sentences about what this person said and how
    "strengths": string[],                 // up to 4, each grounded in what they said
    "concerns": string[],                  // up to 3, only if supported by the transcript
    "quotes": string[],                    // up to 2 short verbatim quotes
    "scores": { "criterion": string, "score": number, "reason": string }[]   // only when criteria are given; score 1-5
  }],
  "followUps": string[]                    // suggested follow-up questions or next steps
}`;

export async function POST(req: Request) {
  const auth = authMember(req, 8);
  if ('error' in auth) return auth.error;
  if (!auth.member.isHost) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (!aiConfig().ok) return Response.json({ error: 'ai_not_configured' }, { status: 503 });

  let body: { mode?: string; transcript?: Seg[]; hosts?: string[]; criteria?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const text = transcriptText(Array.isArray(body.transcript) ? body.transcript : []);
  if (text.length < 40) return Response.json({ error: 'too_short' }, { status: 422 });

  const interview = body.mode === 'interview';
  const criteria = (Array.isArray(body.criteria) ? body.criteria : []).map((c) => String(c).slice(0, 60)).slice(0, 8);
  const hosts = (Array.isArray(body.hosts) ? body.hosts : []).map((h) => String(h).slice(0, 40)).slice(0, 6);

  const system = `You write meeting notes from a speech-to-text transcript. The transcript can contain recognition errors; do not over-interpret odd words.
Rules: use ONLY what is in the transcript. Never invent facts, names, scores or quotes. If something is unclear, leave it out.
Reply with ONE valid JSON object and nothing else, matching this shape:
${SHAPE}
${
  interview
    ? `This was an interview or screening. Hosts/interviewers: ${hosts.join(', ') || 'unknown'}. In "people", include one entry per candidate (not the interviewers).${
        criteria.length ? ` Score each candidate on these criteria from 1 to 5: ${criteria.join(', ')}. Scores are suggestions for the host, each with a one-sentence reason.` : ' Leave "scores" as an empty array.'
      }`
    : 'This was a general meeting. In "people", include one entry per participant who spoke meaningfully. Leave "scores" as an empty array.'
}
Write in the language mostly used in the transcript (English unless it is clearly Hindi/Hinglish).`;

  try {
    const out = await chat(
      [
        { role: 'system', content: system },
        { role: 'user', content: `TRANSCRIPT\n${text}` },
      ],
      { json: true, temperature: 0.2, maxTokens: 3500 },
    );
    const parsed = parseJson<Record<string, unknown>>(out);
    if (!parsed) return Response.json({ error: 'ai_bad_output' }, { status: 502 });
    return Response.json({ result: parsed });
  } catch {
    return Response.json({ error: 'ai_failed' }, { status: 502 });
  }
}
