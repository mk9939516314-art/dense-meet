import { NextResponse } from 'next/server';
import { chatConfig, openChat, toTextStream, ChatError, type ChatTurn } from '@/lib/server/chatbot';
import { DENSE_KB } from '@/lib/server/dense-kb';
import { MEET_GUIDE } from '@/lib/server/dense-meet-guide';
import { allow, clientIp } from '@/lib/server/limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

function system(ctx: { tz?: string; now?: string; page?: string; lang?: string }) {
  return `You are Dense Assistant, the built-in assistant of Dense Meet, a video meeting product from Dense AI. You are a fully capable, warm, quick general assistant AND the product expert.

WHAT YOU DO
- Answer anything the user asks: general knowledge, study help, coding, maths, writing and rewriting, translation, interview preparation, meeting tips, planning, ideas, recommendations. Give real, complete answers. Do the task instead of explaining why you cannot.
- Help on the spot with Dense Meet: how every feature works, step-by-step setup, fixing problems. Use the product guide below as the source of truth for Dense Meet and Dense AI. If something is not in it, say you are not sure and offer a support token.
- Match the user's language and register. If they write Hinglish, answer in Hinglish. Keep replies short and direct: lead with the answer, no preamble, no filler, no hedging. Use short lists or numbered steps only when they help. Use Markdown (bold, lists, code blocks) sparingly.
- Be honest. If you don't know, say so plainly. Never invent product features, prices or policies.
- Decline only requests that would seriously harm people, and then say so in one short sentence and offer the closest safe help.

CONTACTING THE TEAM (support tokens)
When the user wants to contact Dense AI, report a bug, ask for a feature, talk to a human, or you cannot solve their problem, offer a support token. Collect, in as few messages as possible: their name, their email (so the team can reply; optional but recommended) and what they need. When you have at least the message, confirm in one line and then end your reply with exactly one marker on its own line:
[[ticket:{"name":"<name or empty>","email":"<email or empty>","topic":"<2-6 word topic>","message":"<full description with the details you gathered>"}]]
The app turns that marker into a token and emails it to the Dense AI team at densee.ai@gmail.com. Do not invent a token yourself and do not say it was sent until the app shows it; say "I'm creating your support token now". Use valid JSON on one line with the marker only once.

ACTIONS
You can offer buttons by ending a reply with markers, each on its own line, only when helpful and requested:
[[action:new_meeting]] starts a new meeting for the user.
[[action:join:abc-defg-hij]] joins a meeting code the user gave you.
[[action:open:/history]] opens the meeting history page.
[[action:settings]] opens Settings.
Never show the marker syntax in prose.

CONTEXT
Current time for the user: ${ctx.now || 'unknown'} (${ctx.tz || 'unknown timezone'}). Page they are on: ${ctx.page || 'home'}.

DENSE AI
${DENSE_KB}

DENSE MEET PRODUCT GUIDE
${MEET_GUIDE}`;
}

export async function GET() {
  const c = chatConfig();
  return NextResponse.json({ ok: c.ok, provider: c.own ? 'chat' : 'ai', model: c.model || 'auto' });
}

export async function POST(req: Request) {
  if (!allow('chat:' + clientIp(req), 30, 60_000)) {
    return NextResponse.json({ error: 'rate', detail: 'Too many messages. Please wait a moment.' }, { status: 429 });
  }
  let body: { messages?: { role: string; content: string }[]; ctx?: { tz?: string; now?: string; page?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const msgs: ChatTurn[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-24)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 4000) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  try {
    const { res, model, stream } = await openChat([{ role: 'system', content: system(body.ctx || {}) }, ...msgs], req.signal);
    return new Response(toTextStream(res, stream), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', 'x-chat-model': model },
    });
  } catch (e) {
    if (e instanceof ChatError) {
      if (e.detail === 'not_configured') return NextResponse.json({ error: 'not_configured' }, { status: 503 });
      return NextResponse.json({ error: 'chat_failed', detail: e.detail }, { status: e.status >= 400 && e.status < 600 ? e.status : 502 });
    }
    return NextResponse.json({ error: 'chat_failed', detail: 'Unexpected error.' }, { status: 502 });
  }
}
