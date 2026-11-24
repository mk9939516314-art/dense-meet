import { NextResponse } from 'next/server';
import { agentName, isAdmin, sessionUser } from '@/lib/server/admin';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const ok = isAdmin(req);
  return NextResponse.json({ ok, user: ok ? sessionUser(req) : '', agent: ok ? agentName(req) : '' }, { headers: { 'Cache-Control': 'no-store' } });
}
