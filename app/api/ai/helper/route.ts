import { authMember } from '@/lib/server/auth';
import { aiConfig, chat, type ChatMsg } from '@/lib/server/ai';
import { DENSE_KB } from '@/lib/server/dense-kb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SYSTEM = `You are the Dense Meet AI Helper, shown inside a video meeting.
You only help with two topics: (1) Dense AI, the company, its services and process; (2) how to use Dense Meet.
Answer ONLY from the knowledge base below. If the answer is not there, say you do not have that information and suggest asking the meeting host or contacting Dense AI. Never invent facts, prices, names or numbers.
If a question is about anything else (general knowledge, coding, news, personal advice, homework), politely decline in one sentence and offer to help with Dense AI or Dense Meet instead.
Keep answers short: 1 to 4 sentences, plain text, no markdown headings. Reply in the same language the person writes in (Hindi, English or Hinglish).

KNOWLEDGE BASE
${DENSE_KB}`;

export async function POST(req: Request) {
  const auth = authMember(req, 20);
  if ('error' in auth) return auth.error;
  if (!aiConfig().ok) return Response.json({ error: 'ai_not_configured' }, { status: 503 });

  let body: { question?: string; history?: { role: string; content: string }[] } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const question = String(body.question || '').trim().slice(0, 800);
  if (!question) return Response.json({ error: 'bad_request' }, { status: 400 });

  const history: ChatMsg[] = (Array.isArray(body.history) ? body.history : [])
    .slice(-6)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 800) }));

  try {
    const answer = await chat([{ role: 'system', content: SYSTEM }, ...history, { role: 'user', content: question }], {
      temperature: 0.2,
      maxTokens: 500,
    });
    return Response.json({ answer: answer.trim() });
  } catch {
    return Response.json({ error: 'ai_failed' }, { status: 502 });
  }
}
