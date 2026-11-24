import { NextResponse } from 'next/server';
import { chatConfig, openChat, toTextStream, ChatError, type ChatTurn } from '@/lib/server/chatbot';
import { DENSE_KB } from '@/lib/server/dense-kb';
import { MEET_GUIDE } from '@/lib/server/dense-meet-guide';
import { siteKnowledge } from '@/lib/server/siteknow';
import { allow, clientIp } from '@/lib/server/limit';
import { addMsg, ensureSess, getKnowledge, settle, SID_RE } from '@/lib/server/support';

export const runtime = 'nodejs';
export const preferredRegion = 'bom1';
export const maxDuration = 60;

function system(ctx: { tz?: string; now?: string; page?: string }, site: string, notes: string, missed: boolean) {
  return `You are Dense Assistant, the built-in assistant of Dense Meet, a video meeting product from Dense AI. You are a fully capable, warm, quick general assistant AND the expert on Dense AI and Dense Meet.

WHAT YOU DO
- Answer anything the user asks: general knowledge, study help, coding, maths, writing and rewriting, translation, interview preparation, meeting tips, planning, ideas, recommendations. Give real, complete answers. Do the task instead of explaining why you cannot.
- Questions about Dense AI (who runs it, services, how it works, contact) are answered from the OFFICIAL KNOWLEDGE below, which comes from the company's own website and team notes. Use it first; it overrides your memory. If it does not contain the answer, say you don't have that detail and offer to connect the user to an executive or raise a support token.
- Help on the spot with Dense Meet: how every feature works, step-by-step setup, fixing problems, using the product guide below.
- Match the user's language. If they write Hinglish, answer in Hinglish. Be fast and brief: lead with the answer, no preamble, no filler, no hedging. Short lists or numbered steps only when they help.
- Be honest. Never invent product features, prices, names or policies.
- Decline only requests that would seriously harm people, in one short sentence, and offer the closest safe help.

TALKING TO A PERSON
When the user asks for a human, an executive, customer care, an agent or "support person", reply with one short line like "Connecting you to a Dense AI executive now" and end with this marker on its own line:
[[connect:{"name":"<their name if known>","email":"<their email if known>","reason":"<short reason>"}]]
The app then rings an executive for up to one minute. If nobody is free, control comes back to you: apologise once, keep helping and offer a support token.${missed ? '\nIMPORTANT: the user just asked for an executive and none was available. Say so briefly, keep helping, and offer a support token.' : ''}

SUPPORT TOKENS
When the user wants to report a bug, send a request, or you cannot solve their problem, offer a support token (it is emailed to the team at densee.ai@gmail.com). Collect, in as few messages as possible: their name, their email (optional) and what they need. Then end your reply with exactly one marker on its own line:
[[ticket:{"name":"<name or empty>","email":"<email or empty>","topic":"<2-6 word topic>","message":"<full description with the details you gathered>"}]]
Do not invent a token yourself; say "I'm creating your support token now". Use valid one-line JSON, marker once.

ACTIONS
Offer buttons by ending a reply with markers, each on its own line, only when helpful: [[action:new_meeting]] starts a meeting. [[action:join:abc-defg-hij]] joins a code the user gave. [[action:open:/history]] opens history. [[action:settings]] opens Settings. Never show marker syntax in prose.

CONTEXT
User's local time: ${ctx.now || 'unknown'} (${ctx.tz || 'unknown timezone'}). Page: ${ctx.page || 'home'}.

OFFICIAL KNOWLEDGE: TEAM NOTES (highest priority)
${notes || '(none yet)'}

OFFICIAL KNOWLEDGE: DENSE AI
${DENSE_KB}

OFFICIAL KNOWLEDGE: LIVE TEXT FROM THE DENSE AI WEBSITE
${site || '(website text unavailable right now; use the notes above)'}

DENSE MEET PRODUCT GUIDE
${MEET_GUIDE}`;
}

export async function GET() {
  const c = chatConfig();
  return NextResponse.json({ ok: c.ok, provider: c.own ? 'chat' : 'ai', model: c.model || 'auto' });
}

const strip = (t: string) => t.replace(/\[\[[\s\S]*?\]\]/g, '').trim();

export async function POST(req: Request) {
  if (!allow('chat:' + clientIp(req), 30, 60_000)) {
    return NextResponse.json({ error: 'rate', detail: 'Too many messages. Please wait a moment.' }, { status: 429 });
  }
  let body: { sid?: string; messages?: { role: string; content: string }[]; ctx?: { tz?: string; now?: string; page?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const msgs: ChatTurn[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-14)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 3000) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const sid = body.sid && SID_RE.test(body.sid) ? body.sid : '';
  let missed = false;
  if (sid) {
    try {
      const s = await settle(await ensureSess(sid, body.ctx?.page));
      await addMsg(sid, 'user', msgs[msgs.length - 1].content);
      if (s.status === 'live' || s.status === 'requested') return NextResponse.json({ live: true, status: s.status });
      missed = Boolean(s.missed);
    } catch {
      /* the chat still works if the store is down */
    }
  }

  try {
    const [site, notes] = await Promise.all([siteKnowledge(), getKnowledge().catch(() => '')]);
    const { res, model, stream } = await openChat([{ role: 'system', content: system(body.ctx || {}, site, notes, missed) }, ...msgs], req.signal);
    let full = '';
    const dec = new TextDecoder();
    const save = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, c) {
        full += dec.decode(chunk, { stream: true });
        c.enqueue(chunk);
      },
      async flush() {
        const t = strip(full);
        if (sid && t) await addMsg(sid, 'bot', t).catch(() => {});
      },
    });
    return new Response(toTextStream(res, stream).pipeThrough(save), {
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
