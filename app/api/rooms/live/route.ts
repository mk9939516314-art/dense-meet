import { ROOM_RE, livekitEnv, roomSvc } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Which of these meeting codes still have people in them? Used by "Recent meetings" so a person can rejoin a running meeting. */
export async function POST(req: Request) {
  if (!livekitEnv().ok) return Response.json({ live: {} });
  let codes: string[] = [];
  try {
    const b = await req.json();
    codes = (Array.isArray(b.codes) ? b.codes : []).map((c: unknown) => String(c).toLowerCase()).filter((c: string) => ROOM_RE.test(c)).slice(0, 10);
  } catch {
    return Response.json({ live: {} });
  }
  if (!codes.length) return Response.json({ live: {} });
  try {
    const rooms = await roomSvc().listRooms(codes);
    const live: Record<string, boolean> = {};
    rooms.forEach((r) => {
      if (r.numParticipants > 0) live[r.name] = true;
    });
    return Response.json({ live });
  } catch {
    return Response.json({ live: {} });
  }
}
