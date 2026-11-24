import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/server/admin';
import { livekitEnv, roomSvc } from '@/lib/server/auth';
import { parseMeta } from '@/lib/perms';

export const runtime = 'nodejs';
export const preferredRegion = 'bom1';

export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'auth' }, { status: 401 });
  if (!livekitEnv().ok) return NextResponse.json({ rooms: [], setup: true });
  try {
    const svc = roomSvc();
    const rooms = await svc.listRooms();
    const out = await Promise.all(
      rooms.map(async (r) => {
        const ps = await svc.listParticipants(r.name).catch(() => []);
        const people = ps.map((p) => {
          const m = parseMeta(p.metadata);
          return {
            identity: p.identity,
            name: p.name || p.identity,
            role: m.role,
            label: m.label,
            status: m.status,
            joinedAt: Number(p.joinedAt || 0) * 1000,
            mic: p.tracks.some((t) => t.source === 2 && !t.muted),
            cam: p.tracks.some((t) => t.source === 1 && !t.muted),
          };
        });
        return { name: r.name, started: Number(r.creationTime || 0) * 1000, count: people.length, people };
      }),
    );
    out.sort((a, b) => b.started - a.started);
    return NextResponse.json({ rooms: out, now: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'livekit' }, { status: 502 });
  }
}
