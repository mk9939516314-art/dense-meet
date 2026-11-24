import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { allow, clientIp } from '@/lib/server/limit';
import { addMsg, ensureSess, getSess, saveSess, saveTicket, SID_RE } from '@/lib/server/support';

export const runtime = 'nodejs';
export const preferredRegion = 'bom1';

const TO = (process.env.SUPPORT_TO || 'densee.ai@gmail.com').trim();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function token() {
  const b = randomBytes(8);
  const s = Array.from(b, (x: number) => ALPHABET[x % ALPHABET.length]).join('');
  return `DM-${s.slice(0, 4)}-${s.slice(4)}`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

async function viaResend(t: string, f: Fields) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  if (!key) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: (process.env.SUPPORT_FROM || 'Dense Meet <onboarding@resend.dev>').trim(),
      to: [TO],
      reply_to: f.email || undefined,
      subject: `[${t}] ${f.topic || 'Support request'}`,
      html: `<p><b>Token:</b> ${t}</p><p><b>Name:</b> ${esc(f.name || '-')}<br><b>Email:</b> ${esc(f.email || '-')}<br><b>Page:</b> ${esc(f.page || '-')}</p><p style="white-space:pre-wrap">${esc(f.message)}</p>`,
    }),
  });
  return res.ok;
}

// No key needed. The first time ever, FormSubmit emails the inbox an activation link; after one click it forwards every request.
async function viaFormSubmit(t: string, f: Fields) {
  const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(TO)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      _subject: `[${t}] ${f.topic || 'Support request'}`,
      _template: 'table',
      _captcha: 'false',
      token: t,
      name: f.name || '-',
      email: f.email || '-',
      page: f.page || '-',
      message: f.message,
      ...(f.email ? { _replyto: f.email } : {}),
    }),
  });
  if (!res.ok) return false;
  const j = (await res.json().catch(() => ({}))) as { success?: string | boolean };
  return j.success === true || j.success === 'true';
}

type Fields = { name: string; email: string; topic: string; message: string; page: string };

export async function POST(req: Request) {
  if (!allow('support:' + clientIp(req), 5, 60 * 60_000)) {
    return NextResponse.json({ error: 'rate', detail: 'Too many requests from this device. Try again in a while.' }, { status: 429 });
  }
  let b: Partial<Fields> & { sid?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const f: Fields = {
    name: String(b.name || '').trim().slice(0, 80),
    email: String(b.email || '').trim().slice(0, 120),
    topic: String(b.topic || '').trim().slice(0, 80),
    message: String(b.message || '').trim().slice(0, 4000),
    page: String(b.page || '').trim().slice(0, 120),
  };
  if (f.message.length < 3) return NextResponse.json({ error: 'message_required' }, { status: 400 });
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return NextResponse.json({ error: 'bad_email' }, { status: 400 });

  const t = token();
  let sent = false;
  for (const send of [viaResend, viaFormSubmit]) {
    try {
      if (await send(t, f)) {
        sent = true;
        break;
      }
    } catch {
      /* try the next route */
    }
  }
  // Keep the ticket for the admin page and tie it to the chat it came from.
  const sid = b.sid && SID_RE.test(b.sid) ? b.sid : '';
  try {
    await saveTicket({ token: t, ...f, sid, at: Date.now(), status: 'open', note: '', sent });
    if (sid) {
      const s = await ensureSess(sid, f.page);
      const cur = (await getSess(sid)) || s;
      if (f.name) cur.name = f.name;
      if (f.email) cur.email = f.email;
      cur.ticket = t;
      await saveSess(cur);
      await addMsg(sid, 'system', `Support token ${t} created${f.topic ? ': ' + f.topic : ''}.`, undefined, true);
    }
  } catch {
    /* the token and the email still work without the store */
  }
  const mailto = `mailto:${TO}?subject=${encodeURIComponent(`[${t}] ${f.topic || 'Support request'}`)}&body=${encodeURIComponent(`Token: ${t}\nName: ${f.name}\nEmail: ${f.email}\n\n${f.message}`)}`;
  return NextResponse.json({ token: t, sent, to: TO, mailto });
}
