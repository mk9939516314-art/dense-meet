import { createHmac, timingSafeEqual } from 'node:crypto';

export const ROOM_RE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

export function livekitEnv() {
  const url = process.env.LIVEKIT_URL || '';
  const key = process.env.LIVEKIT_API_KEY || '';
  const secret = process.env.LIVEKIT_API_SECRET || '';
  return { url, key, secret, ok: Boolean(url && key && secret) };
}

export function httpUrl(wss: string) {
  return wss.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}

/** Stateless proof that a browser created the room, so it can be host. */
export function makeHostProof(room: string, secret: string) {
  return createHmac('sha256', secret).update('host:' + room).digest('hex');
}

export function safeEq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type Claims = {
  sub: string;
  name?: string;
  metadata?: string;
  exp?: number;
  video?: { room?: string };
};

/** Verifies a LiveKit access token (HS256) signed with our API secret. */
export function verifyJwt(token: string, secret: string): Claims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = createHmac('sha256', secret).update(h + '.' + p).digest('base64url');
  if (!safeEq(expected, s)) return null;
  try {
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Claims;
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export function bearer(req: Request) {
  const a = req.headers.get('authorization') || '';
  return a.startsWith('Bearer ') ? a.slice(7) : '';
}

export type Member = { identity: string; name: string; room: string; isHost: boolean };

const hits = new Map<string, number[]>();

/** Authenticates a meeting member from their LiveKit token and applies a small per-user rate limit. */
export function authMember(req: Request, limitPerMinute = 24): { member: Member } | { error: Response } {
  const env = livekitEnv();
  if (!env.ok) return { error: Response.json({ error: 'not_configured' }, { status: 503 }) };
  const claims = verifyJwt(bearer(req), env.secret);
  if (!claims || !claims.video?.room) return { error: Response.json({ error: 'unauthorized' }, { status: 401 }) };
  let role = 'guest';
  try {
    role = claims.metadata ? JSON.parse(claims.metadata).role : 'guest';
  } catch {
    role = 'guest';
  }
  const identity = claims.sub;
  const now = Date.now();
  const list = (hits.get(identity) || []).filter((t) => now - t < 60_000);
  if (list.length >= limitPerMinute) return { error: Response.json({ error: 'rate_limited' }, { status: 429 }) };
  list.push(now);
  hits.set(identity, list);
  return { member: { identity, name: claims.name || identity, room: claims.video.room, isHost: role === 'host' } };
}

import { RoomServiceClient } from 'livekit-server-sdk';
import { parseMeta, parseRoomMeta, type PMeta, type RoomMeta } from '@/lib/perms';

export function roomSvc() {
  const env = livekitEnv();
  return new RoomServiceClient(httpUrl(env.url), env.key, env.secret);
}

export async function getRoomMeta(room: string): Promise<RoomMeta> {
  try {
    const list = await roomSvc().listRooms([room]);
    return parseRoomMeta(list[0]?.metadata);
  } catch {
    return {};
  }
}

/** The caller's live role and permissions, read from LiveKit (the token's copy can be stale). */
export async function callerMeta(member: Member): Promise<PMeta> {
  if (member.isHost) return { role: 'host', status: 'in', perms: [] };
  try {
    const p = await roomSvc().getParticipant(member.room, member.identity);
    return parseMeta(p.metadata);
  } catch {
    return { role: 'guest', status: 'in', perms: [] };
  }
}

export function can(meta: PMeta, perm: string) {
  return meta.role === 'host' || (meta.status !== 'waiting' && Boolean(meta.perms?.includes(perm)));
}
