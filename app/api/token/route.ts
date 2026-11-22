import { randomUUID } from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';
import { ROOM_RE, livekitEnv, makeHostProof, safeEq } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const env = livekitEnv();
  if (!env.ok) return Response.json({ error: 'not_configured' }, { status: 503 });

  let body: { room?: string; name?: string; hostProof?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  const room = String(body.room || '').toLowerCase();
  if (!ROOM_RE.test(room)) return Response.json({ error: 'invalid_room' }, { status: 400 });

  const name = String(body.name || '').replace(/[<>]/g, '').trim().slice(0, 40) || 'Guest';
  const isHost = typeof body.hostProof === 'string' && safeEq(body.hostProof, makeHostProof(room, env.secret));

  const identity = randomUUID();
  const at = new AccessToken(env.key, env.secret, {
    identity,
    name,
    ttl: '6h',
    metadata: JSON.stringify({ role: isHost ? 'host' : 'guest' }),
  });
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });

  return Response.json({ token: await at.toJwt(), url: env.url, identity, isHost });
}
