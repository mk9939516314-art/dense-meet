import { NextResponse } from 'next/server';
import { sessionCookie } from '@/lib/server/admin';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.append('Set-Cookie', sessionCookie('', true));
  return res;
}
