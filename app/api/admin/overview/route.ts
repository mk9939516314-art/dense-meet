import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/server/admin';
import { storeKind } from '@/lib/server/store';
import { agentSeen, listSessions, listTickets, settle } from '@/lib/server/support';

export const runtime = 'nodejs';
export const preferredRegion = 'bom1';

export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'auth' }, { status: 401 });
  try {
    await agentSeen();
    const list = await listSessions(80);
    for (const s of list) if (s.status === 'requested') await settle(s);
    const tickets = await listTickets(60);
    return NextResponse.json(
      { db: storeKind(), now: Date.now(), sessions: list, tickets },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'store', db: storeKind() }, { status: 503 });
  }
}
