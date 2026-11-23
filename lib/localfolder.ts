/** Save recordings into a folder the person picked on their computer (File System Access API). */
type Dir = FileSystemDirectoryHandle & { requestPermission?: (o: { mode: string }) => Promise<string>; queryPermission?: (o: { mode: string }) => Promise<string> };

const DB = 'dense-meet';
const STORE = 'kv';

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function put(k: string, v: unknown) {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(v, k);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function get<T>(k: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((res, rej) => {
    const q = db.transaction(STORE).objectStore(STORE).get(k);
    q.onsuccess = () => res(q.result as T | undefined);
    q.onerror = () => rej(q.error);
  });
}

export const folderSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export async function pickFolder(): Promise<string> {
  const h = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<Dir> }).showDirectoryPicker({ mode: 'readwrite', id: 'dense-meet-recordings' });
  await put('rec-dir', h);
  return h.name;
}

export async function folderName(): Promise<string | null> {
  try {
    const h = await get<Dir>('rec-dir');
    return h ? h.name : null;
  } catch {
    return null;
  }
}

export async function forgetFolder() {
  try {
    await put('rec-dir', undefined);
  } catch {
    /* ignore */
  }
}

export type FileSink = { write: (b: Blob) => Promise<void>; close: () => Promise<void> };

/** Opens <chosen folder>/<YYYY-MM-DD>/<name> for streaming writes. Must be called from a click. */
export async function openRecordingFile(day: string, name: string): Promise<FileSink> {
  const h = await get<Dir>('rec-dir');
  if (!h) throw new Error('no folder');
  if (h.queryPermission && (await h.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    if (!h.requestPermission || (await h.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('permission');
  }
  const dir = await h.getDirectoryHandle(day, { create: true });
  const file = await dir.getFileHandle(name, { create: true });
  const w = await file.createWritable();
  return { write: (b) => w.write(b), close: () => w.close() };
}
