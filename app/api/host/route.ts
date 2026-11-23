import { authMember, callerMeta, can, getRoomMeta, roomSvc } from '@/lib/server/auth';
import { PERM_IDS, parseMeta, type PMeta } from '@/lib/perms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// LiveKit track sources: 1 = camera, 2 = microphone.
const TrackSource = { CAMERA: 1, MICROPHONE: 2 } as const;

type Action = 'mute' | 'muteAll' | 'remove' | 'end' | 'admit' | 'deny' | 'roomSet' | 'setRole';
type Body = {
  action?: Action;
  target?: string;
  kind?: 'mic' | 'cam';
  set?: { wait?: boolean; locked?: boolean; interview?: boolean };
  label?: string;
  perms?: string[];
};

const OPEN = { canSubscribe: true, canPublish: true, canPublishData: true, canUpdateMetadata: true, canPublishSources: [], hidden: false, recorder: false, agent: false, canSubscribeMetrics: false };

/** Controls for hosts and for people the host gave a role to. Every call is checked on the server against live roles. */
export async function POST(req: Request) {
  const auth = authMember(req, 90);
  if ('error' in auth) return auth.error;
  const { member } = auth;
  const me = await callerMeta(member);

  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const a = body.action;
  const svc = roomSvc();
  const target = body.target || '';
  const deny = () => Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    if (a === 'end' || a === 'roomSet' || a === 'setRole') {
      if (me.role !== 'host') return deny();
    } else if (a === 'remove' || a === 'deny') {
      if (!can(me, 'kick') && !(a === 'deny' && can(me, 'admit'))) return deny();
    } else if (a === 'admit') {
      if (!can(me, 'admit')) return deny();
    } else if (a === 'mute' || a === 'muteAll') {
      if (!can(me, 'mute')) return deny();
    } else return Response.json({ error: 'bad_request' }, { status: 400 });

    if (a === 'end') {
      await svc.deleteRoom(member.room);
    } else if (a === 'roomSet') {
      const cur = await getRoomMeta(member.room);
      const next = { ...cur, ...Object.fromEntries(Object.entries(body.set || {}).filter(([k, v]) => ['wait', 'locked', 'interview'].includes(k) && typeof v === 'boolean')) };
      await svc.updateRoomMetadata(member.room, JSON.stringify(next));
    } else if (a === 'remove' || a === 'deny') {
      if (!target || target === member.identity) return Response.json({ error: 'bad_target' }, { status: 400 });
      const p = await svc.getParticipant(member.room, target).catch(() => null);
      const pm = parseMeta(p?.metadata);
      if (pm.role === 'host') return deny();
      // Remember this browser so a rejoin lands in the waiting room instead of walking back in.
      if (pm.cid) {
        const cur = await getRoomMeta(member.room);
        const blocked = [...(cur.blocked || []).filter((c) => c !== pm.cid), pm.cid].slice(-200);
        await svc.updateRoomMetadata(member.room, JSON.stringify({ ...cur, blocked }));
      }
      await svc.removeParticipant(member.room, target);
    } else if (a === 'admit') {
      const p = await svc.getParticipant(member.room, target);
      const pm = parseMeta(p.metadata);
      const meta: PMeta = { ...pm, status: 'in', blocked: false };
      await svc.updateParticipant(member.room, target, JSON.stringify(meta), OPEN as never);
      if (pm.cid) {
        const cur = await getRoomMeta(member.room);
        if (cur.blocked?.includes(pm.cid)) await svc.updateRoomMetadata(member.room, JSON.stringify({ ...cur, blocked: cur.blocked.filter((c) => c !== pm.cid) }));
      }
    } else if (a === 'setRole') {
      const p = await svc.getParticipant(member.room, target);
      const pm = parseMeta(p.metadata);
      if (pm.role === 'host') return deny();
      const perms = (body.perms || []).filter((x) => PERM_IDS.includes(x));
      const label = String(body.label || '').replace(/[<>]/g, '').trim().slice(0, 24);
      const meta: PMeta = { ...pm, label: label || undefined, perms: label || perms.length ? perms : [] };
      await svc.updateParticipant(member.room, target, JSON.stringify(meta));
    } else if (a === 'mute') {
      if (!target) return Response.json({ error: 'bad_request' }, { status: 400 });
      const p = await svc.getParticipant(member.room, target);
      const want = body.kind === 'cam' ? TrackSource.CAMERA : TrackSource.MICROPHONE;
      await Promise.all(p.tracks.filter((t) => t.source === want && !t.muted).map((t) => svc.mutePublishedTrack(member.room, target, t.sid, true)));
    } else if (a === 'muteAll') {
      const list = await svc.listParticipants(member.room);
      await Promise.all(
        list
          .filter((p) => p.identity !== member.identity)
          .flatMap((p) => p.tracks.filter((t) => t.source === TrackSource.MICROPHONE && !t.muted).map((t) => svc.mutePublishedTrack(member.room, p.identity, t.sid, true))),
      );
    }
  } catch {
    return Response.json({ error: 'failed' }, { status: 502 });
  }
  return Response.json({ ok: true });
}
