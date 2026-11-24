import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/server/admin';
import { countMsgs, getSess, readMsgs, SID_RE, settle } from '@/lib/server/support';

export const runtime = 'nodejs';
export const preferredRegion = 'bom1';

export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'auth' }, { status: 401 });
  const u = new URL(req.url);
  const sid = u.searchParams.get('sid') || '';
  const n = Math.max(0, Number(u.searchParams.get('n') || 0));
  if (!SID_RE.test(sid)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    const s = await getSess(sid);
    if (!s) return NextResponse.json({ error: 'gone' }, { status: 404 });
    await settle(s);
    const total = await countMsgs(sid);
    const msgs = total > n ? await readMsgs(sid, n) : [];
    return NextResponse.json({ sess: s, total, msgs }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'store' }, { status: 503 });
  }
}
