import * as db from './store';

export type Status = 'bot' | 'requested' | 'live' | 'closed';
export type Sess = {
  id: string;
  at: number;
  page: string;
  name: string;
  email: string;
  status: Status;
  reqAt?: number;
  expAt?: number;
  agent?: string;
  reason?: string;
  ticket?: string;
  missed?: boolean;
};
export type SMsg = { id: string; role: 'user' | 'bot' | 'agent' | 'system'; text: string; at: number; by?: string; hide?: boolean };
export type Ticket = { token: string; name: string; email: string; topic: string; message: string; page: string; sid: string; at: number; status: 'open' | 'closed'; note: string; sent: boolean };

export const WEEK = 7 * 24 * 3600;
export const HANDOFF_MS = 60_000;
export const SID_RE = /^[a-z0-9-]{8,48}$/;

const sk = (id: string) => `dm:s:${id}`;
const mk = (id: string) => `dm:m:${id}`;
const lk = (id: string) => `dm:l:${id}`;
const rid = () => Math.random().toString(36).slice(2, 10);

const parse = <T>(v: string | null): T | null => {
  if (!v) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
};

export async function getSess(id: string) {
  return parse<Sess>(await db.get(sk(id)));
}

export async function saveSess(s: Sess) {
  await db.set(sk(s.id), JSON.stringify(s), WEEK);
}

export async function ensureSess(id: string, page = '') {
  const cur = await getSess(id);
  if (cur) return cur;
  const s: Sess = { id, at: Date.now(), page: page.slice(0, 40), name: '', email: '', status: 'bot' };
  await saveSess(s);
  return s;
}

/** `hide` marks a note only the executives should see. */
export async function addMsg(id: string, role: SMsg['role'], text: string, by?: string, hide?: boolean) {
  const m: SMsg = { id: rid(), role, text: text.slice(0, 4000), at: Date.now(), ...(by ? { by } : {}), ...(hide ? { hide: true } : {}) };
  await db.rpush(mk(id), JSON.stringify(m), WEEK);
  await db.set(lk(id), JSON.stringify({ role, text: m.text.slice(0, 120), at: m.at }), WEEK);
  await db.zadd('dm:sessions', m.at, id);
  return m;
}

export async function touch(id: string) {
  await db.zadd('dm:sessions', Date.now(), id);
}

export async function readMsgs(id: string, from: number) {
  const raw = await db.lrange(mk(id), Math.max(0, from));
  return raw.map((r) => parse<SMsg>(r)).filter((x): x is SMsg => Boolean(x));
}

export const countMsgs = (id: string) => db.llen(mk(id));

/** A request nobody answered within a minute goes back to the bot. Checked whenever someone looks at the session. */
export async function settle(s: Sess) {
  if (s.status === 'requested' && s.expAt && Date.now() > s.expAt) {
    s.status = 'bot';
    s.missed = true;
    delete s.expAt;
    await saveSess(s);
    await addMsg(s.id, 'system', 'No executive was free in time. The assistant will keep helping, and your request is saved with the team.');
  }
  return s;
}

export async function agentSeen() {
  await db.set('dm:agent:seen', String(Date.now()), 60);
}

export async function agentOnline() {
  const v = await db.get('dm:agent:seen');
  return Boolean(v && Date.now() - Number(v) < 25_000);
}

export async function connect(id: string, info: { name?: string; email?: string; reason?: string; page?: string }) {
  const s = await ensureSess(id, info.page);
  if (s.status === 'live') return s;
  if (info.name) s.name = info.name.slice(0, 80);
  if (info.email) s.email = info.email.slice(0, 120);
  s.reason = (info.reason || s.reason || '').slice(0, 400);
  s.missed = false;
  if (!(await agentOnline())) {
    s.status = 'bot';
    s.missed = true;
    await saveSess(s);
    await addMsg(id, 'system', 'No executive is online right now. The assistant will keep helping, and you can raise a support token so the team replies by email.');
    return s;
  }
  s.status = 'requested';
  s.reqAt = Date.now();
  s.expAt = s.reqAt + HANDOFF_MS;
  await saveSess(s);
  await addMsg(id, 'system', `${s.name || 'The customer'} asked to talk to an executive.${s.reason ? ' Reason: ' + s.reason : ''}`, undefined, true);
  return s;
}

export async function setStatus(id: string, status: Status, agent?: string, note?: string, hide?: boolean) {
  const s = await getSess(id);
  if (!s) return null;
  s.status = status;
  if (agent) s.agent = agent;
  if (status !== 'requested') delete s.expAt;
  await saveSess(s);
  if (note) await addMsg(id, 'system', note, undefined, hide);
  else await touch(id);
  return s;
}

export async function listSessions(limit = 60) {
  const top = await db.ztop('dm:sessions', limit);
  if (!top.length) return [];
  const metas = await db.mget(top.map((t) => sk(t.member)));
  const lasts = await db.mget(top.map((t) => lk(t.member)));
  const out: (Sess & { upd: number; last: { role: string; text: string; at: number } | null })[] = [];
  for (let i = 0; i < top.length; i++) {
    const s = parse<Sess>(metas[i]);
    if (!s) continue;
    out.push({ ...s, upd: top[i].score, last: parse(lasts[i]) });
  }
  return out;
}

const tk = (t: string) => `dm:t:${t}`;

export async function saveTicket(t: Ticket) {
  await db.set(tk(t.token), JSON.stringify(t), 90 * 24 * 3600);
  await db.zadd('dm:tickets', t.at, t.token);
}

export async function getTicket(token: string) {
  return parse<Ticket>(await db.get(tk(token)));
}

export async function listTickets(limit = 50) {
  const top = await db.ztop('dm:tickets', limit);
  if (!top.length) return [];
  const rows = await db.mget(top.map((t) => tk(t.member)));
  return rows.map((r) => parse<Ticket>(r)).filter((x): x is Ticket => Boolean(x));
}

export const getKnowledge = async () => (await db.get('dm:know')) || '';
export const setKnowledge = (v: string) => db.set('dm:know', v.slice(0, 12000));
