import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/server/admin';
import { siteKnowledge, siteStatus } from '@/lib/server/siteknow';
import { getKnowledge } from '@/lib/server/support';

export const runtime = 'nodejs';
export const preferredRegion = 'bom1';

export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'auth' }, { status: 401 });
  await siteKnowledge();
  return NextResponse.json({ notes: await getKnowledge().catch(() => ''), site: siteStatus() }, { headers: { 'Cache-Control': 'no-store' } });
}
