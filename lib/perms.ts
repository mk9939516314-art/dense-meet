/** Permissions a host can hand to any participant through a custom role. */
export const PERMS = [
  { id: 'mute', label: 'Mute and ask for mic or camera' },
  { id: 'admit', label: 'Admit from the waiting room' },
  { id: 'kick', label: 'Remove people' },
  { id: 'notes', label: 'See AI notes and summaries' },
  { id: 'copilot', label: 'Use Host Copilot' },
  { id: 'record', label: 'Start and stop recording' },
] as const;

export type PermId = (typeof PERMS)[number]['id'];
export const PERM_IDS: string[] = PERMS.map((p) => p.id);

export type PMeta = {
  role: 'host' | 'guest';
  /** 'waiting' until the host lets the person in. */
  status?: 'waiting' | 'in';
  /** True when this browser was removed earlier. */
  blocked?: boolean;
  /** Custom role label like "Helper". */
  label?: string;
  perms?: string[];
  /** Stable per-browser id, used so a removed person lands in the waiting room instead of walking back in. */
  cid?: string;
  /** Profile colour (hue) and picture chosen by the person. */
  hue?: number;
  pic?: string;
};

export type RoomMeta = { wait?: boolean; locked?: boolean; interview?: boolean; blocked?: string[] };

export function parseMeta(s?: string | null): PMeta {
  try {
    const m = s ? JSON.parse(s) : {};
    return { role: m.role === 'host' ? 'host' : 'guest', status: m.status === 'waiting' ? 'waiting' : 'in', blocked: Boolean(m.blocked), label: typeof m.label === 'string' ? m.label.slice(0, 24) : undefined, perms: Array.isArray(m.perms) ? m.perms.filter((x: unknown) => typeof x === 'string' && PERM_IDS.includes(x)) : [], cid: typeof m.cid === 'string' ? m.cid.slice(0, 40) : undefined, hue: typeof m.hue === 'number' ? m.hue : undefined, pic: typeof m.pic === 'string' && m.pic.startsWith('data:image/') && m.pic.length < 6000 ? m.pic : undefined };
  } catch {
    return { role: 'guest', status: 'in', perms: [] };
  }
}

export function parseRoomMeta(s?: string | null): RoomMeta {
  try {
    const m = s ? JSON.parse(s) : {};
    return { wait: Boolean(m.wait), locked: Boolean(m.locked), interview: Boolean(m.interview), blocked: Array.isArray(m.blocked) ? m.blocked.filter((x: unknown) => typeof x === 'string').slice(-200) : [] };
  } catch {
    return {};
  }
}
