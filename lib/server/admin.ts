import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'dm_admin';
const TTL = 12 * 60 * 60;

// Default login is the one the owner chose. The password is stored only as a hash. Set ADMIN_USER / ADMIN_PASSWORD
// in Vercel to change it without touching code.
const DEFAULT_USER = 'mayank';
const DEFAULT_HASH = '109cd1b989f8d74a669ae1733f7eb136ae38dab262bc5dd3eb32ae5fee4da835';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const eq = (a: string, b: string) => {
  const x = Buffer.from(sha(a));
  const y = Buffer.from(sha(b));
  return timingSafeEqual(x, y);
};

export const adminUser = () => (process.env.ADMIN_USER || DEFAULT_USER).trim();

export function checkLogin(user: string, pass: string) {
  const u = eq(user.trim().toLowerCase(), adminUser().toLowerCase());
  const envPass = process.env.ADMIN_PASSWORD;
  const p = envPass ? eq(pass, envPass) : eq(sha('dm-admin-v1:' + pass), DEFAULT_HASH);
  return u && p;
}

function secret() {
  return process.env.ADMIN_SECRET || sha('dm-admin-secret:' + (process.env.ADMIN_PASSWORD || DEFAULT_HASH) + (process.env.LIVEKIT_API_SECRET || ''));
}

export function makeSession() {
  const exp = Math.floor(Date.now() / 1000) + TTL;
  const body = `${adminUser()}.${exp}`;
  return `${body}.${createHmac('sha256', secret()).update(body).digest('base64url')}`;
}

export function sessionCookie(value: string, clear = false) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${clear ? '' : value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : TTL}${secure}`;
}

export function isAdmin(req: Request) {
  const raw = (req.headers.get('cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='));
  if (!raw) return false;
  const v = raw.slice(COOKIE.length + 1);
  const i = v.lastIndexOf('.');
  if (i < 0) return false;
  const body = v.slice(0, i);
  const sig = v.slice(i + 1);
  const exp = Number(body.split('.').pop());
  if (!exp || exp < Date.now() / 1000) return false;
  const want = createHmac('sha256', secret()).update(body).digest('base64url');
  return sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}

export const agentName = () => {
  const u = adminUser();
  return u.charAt(0).toUpperCase() + u.slice(1);
};
