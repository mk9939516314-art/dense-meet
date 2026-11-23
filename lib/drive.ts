/** Google Drive upload from the browser. Uses Google Identity Services, so no server and no secrets are needed. */
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const CHUNK = 8 * 256 * 1024; // Drive wants multiples of 256 KiB

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: { client_id: string; scope: string; callback: (r: { access_token?: string; error?: string; expires_in?: number }) => void; error_callback?: (e: unknown) => void }) => { requestAccessToken: (o?: { prompt?: string }) => void };
        };
      };
    };
  }
}

export const clientId = () => {
  try {
    return (localStorage.getItem('dm-gcid') || '').trim() || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  } catch {
    return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  }
};
export const setClientId = (v: string) => {
  try {
    if (v.trim()) localStorage.setItem('dm-gcid', v.trim());
    else localStorage.removeItem('dm-gcid');
  } catch {
    /* ignore */
  }
};

let gisPromise: Promise<void> | null = null;
function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise<void>((resolve, reject) => {
    if (window.google?.accounts) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in.'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

let token = '';
let tokenExp = 0;

export async function driveToken(interactive: boolean): Promise<string> {
  if (token && Date.now() < tokenExp - 60_000) return token;
  await loadGis();
  return new Promise((resolve, reject) => {
    const c = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: SCOPE,
      callback: (r) => {
        if (r.access_token) {
          token = r.access_token;
          tokenExp = Date.now() + (r.expires_in || 3000) * 1000;
          try {
            localStorage.setItem('dm-drive', '1');
          } catch {
            /* ignore */
          }
          resolve(token);
        } else reject(new Error(r.error || 'Google sign-in was cancelled.'));
      },
      error_callback: () => reject(new Error('Google sign-in was cancelled.')),
    });
    c.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

export const driveLinked = () => {
  try {
    return localStorage.getItem('dm-drive') === '1';
  } catch {
    return false;
  }
};
export const driveUnlink = () => {
  token = '';
  tokenExp = 0;
  try {
    localStorage.removeItem('dm-drive');
  } catch {
    /* ignore */
  }
};

async function ensureFolder(t: string, name: string, parent?: string): Promise<string> {
  const qs = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parent ? ` and '${parent}' in parents` : ''}`;
  const f = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qs)}&fields=files(id)`, { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.json());
  if (f.files?.[0]?.id) return f.files[0].id;
  const c = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) }),
  }).then((r) => r.json());
  return c.id;
}

export type DriveUpload = { push: (blob: Blob) => void; finish: () => Promise<{ id: string; link: string } | null>; failed: () => boolean };

/** Starts a resumable upload and streams the recording to Drive while it is being recorded. */
export async function startDriveUpload(name: string, mime: string, day: string): Promise<DriveUpload> {
  const t = await driveToken(false).catch(() => driveToken(true));
  const root = await ensureFolder(t, 'Dense Meet Recordings');
  const parent = await ensureFolder(t, day, root);
  const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime },
    body: JSON.stringify({ name, parents: [parent] }),
  });
  const url = init.headers.get('Location');
  if (!init.ok || !url) throw new Error('Drive refused the upload.');

  let buf: Blob[] = [];
  let buffered = 0;
  let sent = 0;
  let bad = false;
  let chain: Promise<unknown> = Promise.resolve();

  const put = async (data: Blob, final: boolean) => {
    const start = sent;
    const end = start + data.size - 1;
    const total = final ? String(start + data.size) : '*';
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(url, { method: 'PUT', headers: { 'Content-Range': data.size ? `bytes ${start}-${end}/${total}` : `bytes */${total}` }, body: data });
        if (res.status === 308 || res.ok) {
          sent += data.size;
          return res.ok ? ((await res.json().catch(() => null)) as { id: string; webViewLink?: string } | null) : null;
        }
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
    bad = true;
    return null;
  };

  const drain = (all: boolean) => {
    const blob = new Blob(buf);
    const take = all ? blob.size : Math.floor(blob.size / CHUNK) * CHUNK;
    if (!take && !all) return;
    const send = blob.slice(0, take);
    const rest = blob.slice(take);
    buf = rest.size ? [rest] : [];
    buffered = rest.size;
    if (send.size) chain = chain.then(() => (bad ? null : put(send, false)));
  };

  return {
    push: (b) => {
      buf.push(b);
      buffered += b.size;
      if (buffered >= CHUNK) drain(false);
    },
    failed: () => bad,
    finish: async () => {
      const rest = new Blob(buf);
      buf = [];
      const out = (await chain.then(() => (bad ? null : put(rest, true)))) as { id: string; webViewLink?: string } | null;
      return out && out.id ? { id: out.id, link: out.webViewLink || `https://drive.google.com/file/d/${out.id}/view` } : null;
    },
  };
}
