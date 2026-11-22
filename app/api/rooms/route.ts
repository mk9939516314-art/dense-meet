import { randomInt } from 'node:crypto';
import { livekitEnv, makeHostProof } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LETTERS = 'abcdefghjkmnpqrstuvwxyz';

function part(n: number) {
  let s = '';
  for (let i = 0; i < n; i++) s += LETTERS[randomInt(LETTERS.length)];
  return s;
}

/** Creates a new meeting code. The returned hostProof lets this browser join as host. */
export async function POST() {
  const env = livekitEnv();
  if (!env.ok) return Response.json({ error: 'not_configured' }, { status: 503 });
  const room = `${part(3)}-${part(4)}-${part(3)}`;
  return Response.json({ room, hostProof: makeHostProof(room, env.secret) });
}
