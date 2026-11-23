export type Profile = { name: string; hue: number | null; pic: string };

/** Hues that avoid the generic "AI blue": warm and fresh tones first. */
export const HUES = [12, 28, 42, 150, 172, 330, 350, 275, 205];

export function getCid(): string {
  try {
    let c = localStorage.getItem('dm-cid');
    if (!c) {
      c = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-zA-Z0-9-]/g, '');
      localStorage.setItem('dm-cid', c);
    }
    return c;
  } catch {
    return '';
  }
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem('dm-profile');
    if (raw) {
      const p = JSON.parse(raw);
      return { name: String(p.name || ''), hue: typeof p.hue === 'number' ? p.hue : null, pic: typeof p.pic === 'string' ? p.pic : '' };
    }
    return { name: localStorage.getItem('dm-name') || '', hue: null, pic: '' };
  } catch {
    return { name: '', hue: null, pic: '' };
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem('dm-profile', JSON.stringify(p));
    localStorage.setItem('dm-name', p.name);
  } catch {
    /* storage unavailable */
  }
}

/** Crops to a square and shrinks to a tiny JPEG so it can travel with the participant. */
export function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = 72;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('canvas'));
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      let out = c.toDataURL('image/jpeg', 0.6);
      if (out.length > 5800) out = c.toDataURL('image/jpeg', 0.4);
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image'));
    };
    img.src = url;
  });
}

/** Meeting history kept on this device only. */
export type HistoryItem = { code: string; at: number; host: boolean; title?: string };

export function readHistory(): HistoryItem[] {
  try {
    const l = JSON.parse(localStorage.getItem('dm-history') || '[]');
    return Array.isArray(l) ? l.filter((x) => x && typeof x.code === 'string').slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function pushHistory(item: HistoryItem) {
  try {
    const l = [item, ...readHistory().filter((x) => x.code !== item.code)].slice(0, 20);
    localStorage.setItem('dm-history', JSON.stringify(l));
  } catch {
    /* storage unavailable */
  }
}

/** Notes the host generated, kept on this device so they can be read later from History. */
export function saveNotes(code: string, summary: unknown) {
  try {
    localStorage.setItem('dm-notes-' + code, JSON.stringify({ at: Date.now(), summary }));
  } catch {
    /* storage full or unavailable */
  }
}
export function readNotes(code: string): { at: number; summary: unknown } | null {
  try {
    const v = localStorage.getItem('dm-notes-' + code);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
