import { NextResponse } from 'next/server';
import { adminUser, agentName, isAdmin } from '@/lib/server/admin';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const ok = isAdmin(req);
  return NextResponse.json({ ok, user: ok ? adminUser() : '', agent: ok ? agentName() : '' }, { headers: { 'Cache-Control': 'no-store' } });
}
