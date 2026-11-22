import { RoomServiceClient } from 'livekit-server-sdk';
import { authMember, httpUrl, livekitEnv } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { action?: 'mute' | 'muteAll' | 'remove' | 'end'; target?: string };

/** Host-only controls, enforced on the server with the caller's signed token. */
export async function POST(req: Request) {
  const auth = authMember(req, 60);
  if ('error' in auth) return auth.error;
  const { member } = auth;
  if (!member.isHost) return Response.json({ error: 'forbidden' }, { status: 403 });

  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  const env = livekitEnv();
  const svc = new RoomServiceClient(httpUrl(env.url), env.key, env.secret);

  try {
    if (body.action === 'end') {
      await svc.deleteRoom(member.room);
    } else if (body.action === 'remove' && body.target) {
      if (body.target === member.identity) return Response.json({ error: 'bad_target' }, { status: 400 });
      await svc.removeParticipant(member.room, body.target);
    } else if (body.action === 'mute' && body.target) {
      const p = await svc.getParticipant(member.room, body.target);
      for (const t of p.tracks) {
        if (Number(t.type) === 0 && !t.muted) await svc.mutePublishedTrack(member.room, body.target, t.sid, true);
      }
    } else if (body.action === 'muteAll') {
      const list = await svc.listParticipants(member.room);
      for (const p of list) {
        if (p.identity === member.identity) continue;
        for (const t of p.tracks) {
          if (Number(t.type) === 0 && !t.muted) await svc.mutePublishedTrack(member.room, p.identity, t.sid, true);
        }
      }
    } else {
      return Response.json({ error: 'bad_request' }, { status: 400 });
    }
  } catch {
    return Response.json({ error: 'failed' }, { status: 502 });
  }
  return Response.json({ ok: true });
}
