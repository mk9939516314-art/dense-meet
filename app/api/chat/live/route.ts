import { NextResponse } from 'next/server';
import { allow, clientIp } from '@/lib/server/limit';
import { addMsg, connect, countMsgs, ensureSess, getSess, readMsgs, saveSess, settle, setStatus, SID_RE } from '@/lib/server/support';

export const runtime = 'nodejs';
export const preferredRegion = 'bom1';

const view = (s: { status: string; agent?: string; expAt?: number; missed?: boolean }) => ({ status: s.status, agent: s.agent || '', expAt: s.expAt || 0, missed: Boolean(s.missed), now: Date.now() });

/** Customer's poll: current status plus anything the executive (or the system) said since message number n. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const sid = u.searchParams.get('sid') || '';
  const n = Number(u.searchParams.get('n') ?? '-1');
  if (!SID_RE.test(sid)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  if (!allow('poll:' + clientIp(req), 90, 60_000)) return NextResponse.json({ error: 'rate' }, { status: 429 });
  try {
    const s = await getSess(sid);
    if (!s) return NextResponse.json({ status: 'bot', agent: '', expAt: 0, missed: false, now: Date.now(), total: 0, msgs: [] });
    await settle(s);
    const total = await countMsgs(sid);
    const fresh = n >= 0 && total > n ? (await readMsgs(sid, n)).filter((m) => m.role === 'agent' || (m.role === 'system' && !m.hide)) : [];
    return NextResponse.json({ ...view(s), total, msgs: fresh });
  } catch {
    return NextResponse.json({ error: 'store' }, { status: 503 });
  }
}

export async function POST(req: Request) {
  let b: { sid?: string; action?: string; text?: string; name?: string; email?: string; reason?: string; page?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const sid = b.sid || '';
  if (!SID_RE.test(sid)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  if (!allow('live:' + clientIp(req), 40, 60_000)) return NextResponse.json({ error: 'rate', detail: 'Too many messages. Please wait a moment.' }, { status: 429 });
  try {
    if (b.action === 'connect') {
      if (!allow('connect:' + clientIp(req), 6, 10 * 60_000)) return NextResponse.json({ error: 'rate', detail: 'Please wait a few minutes before asking again.' }, { status: 429 });
      const s = await connect(sid, { name: b.name, email: b.email, reason: b.reason, page: b.page });
      return NextResponse.json(view(s));
    }
    if (b.action === 'cancel') {
      const s = await getSess(sid);
      if (s && s.status === 'requested') await setStatus(sid, 'bot', undefined, 'The customer cancelled the request.', true);
      return NextResponse.json(view((await getSess(sid)) || { status: 'bot' }));
    }
    if (b.action === 'leave') {
      const s = await getSess(sid);
      if (s && s.status === 'live') await setStatus(sid, 'bot', undefined, 'The customer ended the chat and went back to the assistant.', true);
      return NextResponse.json(view((await getSess(sid)) || { status: 'bot' }));
    }
    if (b.action === 'say') {
      const text = String(b.text || '').trim().slice(0, 2000);
      if (!text) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
      const s = await settle(await ensureSess(sid, b.page));
      if (b.name && !s.name) {
        s.name = b.name.slice(0, 80);
        await saveSess(s);
      }
      await addMsg(sid, 'user', text);
      return NextResponse.json(view(s));
    }
  } catch {
    return NextResponse.json({ error: 'store' }, { status: 503 });
  }
  return NextResponse.json({ error: 'bad_request' }, { status: 400 });
}
