import { NextResponse } from 'next/server';
import { agentName, isAdmin } from '@/lib/server/admin';
import { livekitEnv, roomSvc } from '@/lib/server/auth';
import { addMsg, getSess, getTicket, saveTicket, setKnowledge, setStatus, SID_RE, settle } from '@/lib/server/support';

export const runtime = 'nodejs';
export const preferredRegion = 'bom1';

export async function POST(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'auth' }, { status: 401 });
  let b: { action?: string; sid?: string; text?: string; token?: string; status?: string; note?: string; notes?: string; room?: string; identity?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const me = agentName(req);
  try {
    switch (b.action) {
      case 'accept': {
        if (!SID_RE.test(b.sid || '')) break;
        const s = await getSess(b.sid!);
        if (!s) return NextResponse.json({ error: 'gone' }, { status: 404 });
        await settle(s);
        if (s.status !== 'requested') return NextResponse.json({ error: 'expired', detail: 'The request already timed out or was handled.' }, { status: 409 });
        await setStatus(s.id, 'live', me, `You are now chatting with ${me} from Dense AI.`);
        return NextResponse.json({ ok: true });
      }
      case 'decline': {
        if (!SID_RE.test(b.sid || '')) break;
        await setStatus(b.sid!, 'bot', me, 'Our executives are busy right now. The assistant will keep helping, and your request is saved with the team.');
        return NextResponse.json({ ok: true });
      }
      case 'takeover': {
        if (!SID_RE.test(b.sid || '')) break;
        await setStatus(b.sid!, 'live', me, `${me} from Dense AI joined the chat.`);
        return NextResponse.json({ ok: true });
      }
      case 'end': {
        if (!SID_RE.test(b.sid || '')) break;
        await setStatus(b.sid!, 'bot', me, 'The executive ended the chat. The assistant is here if you need anything else.');
        return NextResponse.json({ ok: true });
      }
      case 'send': {
        const text = String(b.text || '').trim().slice(0, 2000);
        if (!SID_RE.test(b.sid || '') || !text) break;
        const s = await getSess(b.sid!);
        if (!s) return NextResponse.json({ error: 'gone' }, { status: 404 });
        if (s.status !== 'live') await setStatus(s.id, 'live', me, `${me} from Dense AI joined the chat.`);
        await addMsg(s.id, 'agent', text, me);
        return NextResponse.json({ ok: true });
      }
      case 'ticket': {
        const t = await getTicket(String(b.token || ''));
        if (!t) return NextResponse.json({ error: 'gone' }, { status: 404 });
        if (b.status === 'open' || b.status === 'closed') t.status = b.status;
        if (typeof b.note === 'string') t.note = b.note.slice(0, 2000);
        await saveTicket(t);
        return NextResponse.json({ ok: true });
      }
      case 'know': {
        await setKnowledge(String(b.notes || ''));
        return NextResponse.json({ ok: true });
      }
      case 'endMeeting': {
        if (!livekitEnv().ok || !b.room) break;
        await roomSvc().deleteRoom(b.room);
        return NextResponse.json({ ok: true });
      }
      case 'removePerson': {
        if (!livekitEnv().ok || !b.room || !b.identity) break;
        await roomSvc().removeParticipant(b.room, b.identity);
        return NextResponse.json({ ok: true });
      }
    }
  } catch {
    return NextResponse.json({ error: 'failed', detail: 'That did not work. Try again.' }, { status: 500 });
  }
  return NextResponse.json({ error: 'bad_request' }, { status: 400 });
}
