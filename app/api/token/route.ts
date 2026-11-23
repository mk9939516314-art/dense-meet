import { randomUUID } from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';
import { ROOM_RE, getRoomMeta, livekitEnv, makeHostProof, safeEq } from '@/lib/server/auth';
import type { PMeta } from '@/lib/perms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const env = livekitEnv();
  if (!env.ok) return Response.json({ error: 'not_configured' }, { status: 503 });

  let body: { room?: string; name?: string; hostProof?: string; cid?: string; hue?: number; pic?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  const room = String(body.room || '').toLowerCase();
  if (!ROOM_RE.test(room)) return Response.json({ error: 'invalid_room' }, { status: 400 });

  const name = String(body.name || '').replace(/[<>]/g, '').trim().slice(0, 40) || 'Guest';
  const isHost = typeof body.hostProof === 'string' && safeEq(body.hostProof, makeHostProof(room, env.secret));
  const cid = String(body.cid || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40) || undefined;

  let waiting = false;
  let blocked = false;
  if (!isHost) {
    const rm = await getRoomMeta(room);
    if (rm.locked) return Response.json({ error: 'locked' }, { status: 403 });
    blocked = Boolean(cid && rm.blocked?.includes(cid));
    waiting = Boolean(rm.wait) || blocked;
  }

  const meta: PMeta = {
    role: isHost ? 'host' : 'guest',
    status: waiting ? 'waiting' : 'in',
    blocked,
    cid,
    hue: typeof body.hue === 'number' && body.hue >= 0 && body.hue < 360 ? Math.round(body.hue) : undefined,
    pic: typeof body.pic === 'string' && body.pic.startsWith('data:image/') && body.pic.length < 6000 ? body.pic : undefined,
  };

  const identity = randomUUID();
  const at = new AccessToken(env.key, env.secret, { identity, name, ttl: '6h', metadata: JSON.stringify(meta) });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: !waiting,
    canSubscribe: !waiting,
    canPublishData: !waiting,
    // Needed for hand raise (stored as a participant attribute).
    canUpdateOwnMetadata: !waiting,
  });

  return Response.json({ token: await at.toJwt(), url: env.url, identity, isHost, waiting });
}
