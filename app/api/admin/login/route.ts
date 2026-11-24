import { NextResponse } from 'next/server';
import { checkLogin, makeSession, sessionCookie } from '@/lib/server/admin';
import { allow, clientIp } from '@/lib/server/limit';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!allow('adminlogin:' + clientIp(req), 6, 10 * 60_000)) {
    return NextResponse.json({ error: 'rate', detail: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
  }
  let b: { user?: string; pass?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const who = checkLogin(String(b.user || '').slice(0, 60), String(b.pass || '').slice(0, 120));
  if (!who) {
    await new Promise((r) => setTimeout(r, 700));
    return NextResponse.json({ error: 'invalid', detail: 'Wrong ID or password.' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.headers.append('Set-Cookie', sessionCookie(makeSession(who)));
  return res;
}
