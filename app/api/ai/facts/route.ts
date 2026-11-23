import { authMember, callerMeta, can } from '@/lib/server/auth';
import { AiError, aiConfig, chat, parseJson, transcriptText, type Seg } from '@/lib/server/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/** Live candidate notes: everything each person said about themselves, plus questions the host could ask next. */
export async function POST(req: Request) {
  const auth = authMember(req, 14);
  if ('error' in auth) return auth.error;
  if (!can(await callerMeta(auth.member), 'notes')) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (!aiConfig().ok) return Response.json({ error: 'ai_not_configured' }, { status: 503 });

  let body: { transcript?: Seg[]; hosts?: string[]; role?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const text = transcriptText(Array.isArray(body.transcript) ? body.transcript : [], 28000);
  if (text.length < 30) return Response.json({ error: 'too_short' }, { status: 422 });
  const hosts = (Array.isArray(body.hosts) ? body.hosts : []).map((h) => String(h).slice(0, 40)).slice(0, 6);
  const role = String(body.role || '').slice(0, 120);

  const system = `You are the note-taker for a live interview. The input is a speech-to-text transcript (it can contain recognition errors). Interviewers: ${hosts.join(', ') || 'unknown'}. Lines marked "(question to ...)" are questions the interviewer sent on screen.${role ? ` The role being hired for: ${role}.` : ''}
For EVERY candidate (anyone who is not an interviewer and speaks about themselves or answers questions), list everything concrete they stated about themselves. Be exhaustive: employers and companies, job titles, years of experience, projects, tools and technologies, domains (for example 2D, 3D, animation, QA, annotation), education, certifications, languages, location, availability, salary expectation, strengths and weaknesses they claimed.
Use ONLY what is in the transcript. Never guess, never add facts. Keep each fact short and faithful to the words used.
Also suggest 2 to 4 sharp follow-up questions for each candidate that test what they claimed (for example if they say they worked on 3D, ask about pipelines, tools and a hard problem they solved). Write questions in the language the candidate speaks.
Reply with ONE valid JSON object only:
{ "people": [ { "name": string, "facts": [ { "kind": "experience" | "skill" | "education" | "availability" | "other", "text": string, "at": string } ], "suggestedQuestions": string[] } ] }
"at" is the mm:ss of the line where it was said.`;

  try {
    const out = await chat([{ role: 'system', content: system }, { role: 'user', content: `TRANSCRIPT\n${text}` }], { json: true, temperature: 0.2, maxTokens: 2500 });
    const parsed = parseJson<Record<string, unknown>>(out);
    if (!parsed) return Response.json({ error: 'ai_bad_output' }, { status: 502 });
    return Response.json({ result: parsed });
  } catch (e) {
    return Response.json({ error: 'ai_failed', detail: e instanceof AiError ? e.detail : '' }, { status: 502 });
  }
}
