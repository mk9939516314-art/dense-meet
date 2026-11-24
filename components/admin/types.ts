export type Status = 'bot' | 'requested' | 'live' | 'closed';
export type Sess = {
  id: string;
  at: number;
  upd: number;
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
  last: { role: string; text: string; at: number } | null;
};
export type Msg = { id: string; role: 'user' | 'bot' | 'agent' | 'system'; text: string; at: number; by?: string };
export type Tk = { token: string; name: string; email: string; topic: string; message: string; page: string; sid: string; at: number; status: 'open' | 'closed'; note: string; sent: boolean };
export type Person = { identity: string; name: string; role: 'host' | 'guest'; label?: string; status: 'in' | 'waiting'; joinedAt: number; mic: boolean; cam: boolean };
export type Room = { name: string; started: number; count: number; people: Person[] };

export const ago = (t: number, now = Date.now()) => {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

export const dur = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

export async function api<T>(url: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}
