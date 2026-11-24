/**
 * Tiny key-value store used by support chat and the admin page.
 * With UPSTASH_REDIS_REST_URL/TOKEN (or Vercel KV's KV_REST_API_URL/TOKEN) it is shared by every server instance.
 * Without them it falls back to memory, which only works while one server instance stays warm.
 */
const clean = (v?: string) => (v || '').trim().replace(/^["']|["']$/g, '');

function cfg() {
  const url = clean(process.env.UPSTASH_REDIS_REST_URL) || clean(process.env.KV_REST_API_URL);
  const token = clean(process.env.UPSTASH_REDIS_REST_TOKEN) || clean(process.env.KV_REST_API_TOKEN);
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

export const storeKind = () => (cfg() ? 'redis' : 'memory');

type Cmd = (string | number)[];

async function pipe(cmds: Cmd[]): Promise<unknown[]> {
  const c = cfg()!;
  const res = await fetch(`${c.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('store_' + res.status);
  const j = (await res.json()) as { result?: unknown; error?: string }[];
  return j.map((x) => {
    if (x.error) throw new Error(x.error);
    return x.result;
  });
}

type Mem = { kv: Map<string, { v: string; exp: number }>; lists: Map<string, { items: string[]; exp: number }>; z: Map<string, Map<string, number>> };
const g = globalThis as unknown as { __dmMem?: Mem };
const mem = (): Mem => (g.__dmMem ||= { kv: new Map(), lists: new Map(), z: new Map() });
const alive = (exp: number) => !exp || exp > Date.now();

export async function get(key: string): Promise<string | null> {
  if (cfg()) return (await pipe([['GET', key]]))[0] as string | null;
  const e = mem().kv.get(key);
  return e && alive(e.exp) ? e.v : null;
}

export async function set(key: string, value: string, ttlSec = 0) {
  if (cfg()) {
    await pipe([ttlSec ? ['SET', key, value, 'EX', ttlSec] : ['SET', key, value]]);
    return;
  }
  mem().kv.set(key, { v: value, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
}

export async function mget(keys: string[]): Promise<(string | null)[]> {
  if (!keys.length) return [];
  if (cfg()) return (await pipe([['MGET', ...keys]]))[0] as (string | null)[];
  return keys.map((k) => {
    const e = mem().kv.get(k);
    return e && alive(e.exp) ? e.v : null;
  });
}

export async function rpush(key: string, value: string, ttlSec = 0) {
  if (cfg()) {
    await pipe(ttlSec ? [['RPUSH', key, value], ['EXPIRE', key, ttlSec]] : [['RPUSH', key, value]]);
    return;
  }
  const m = mem();
  const cur = m.lists.get(key);
  const l = cur && alive(cur.exp) ? cur : { items: [], exp: 0 };
  l.items.push(value);
  if (ttlSec) l.exp = Date.now() + ttlSec * 1000;
  m.lists.set(key, l);
}

export async function lrange(key: string, from: number): Promise<string[]> {
  if (cfg()) return ((await pipe([['LRANGE', key, from, -1]]))[0] as string[]) || [];
  const l = mem().lists.get(key);
  return l && alive(l.exp) ? l.items.slice(from) : [];
}

export async function llen(key: string): Promise<number> {
  if (cfg()) return Number((await pipe([['LLEN', key]]))[0] || 0);
  const l = mem().lists.get(key);
  return l && alive(l.exp) ? l.items.length : 0;
}

export async function zadd(key: string, score: number, member: string) {
  if (cfg()) {
    await pipe([['ZADD', key, score, member]]);
    return;
  }
  const m = mem();
  const z = m.z.get(key) || new Map<string, number>();
  z.set(member, score);
  m.z.set(key, z);
}

/** Newest first, with scores. */
export async function ztop(key: string, count: number): Promise<{ member: string; score: number }[]> {
  if (cfg()) {
    const r = ((await pipe([['ZREVRANGE', key, 0, count - 1, 'WITHSCORES']]))[0] as string[]) || [];
    const out: { member: string; score: number }[] = [];
    for (let i = 0; i < r.length; i += 2) out.push({ member: r[i], score: Number(r[i + 1]) });
    return out;
  }
  const z = mem().z.get(key);
  if (!z) return [];
  return Array.from(z.entries())
    .map(([member, score]) => ({ member, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}
