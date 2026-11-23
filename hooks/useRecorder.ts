'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from 'livekit-client';
import { clientId, driveLinked, driveToken, startDriveUpload, type DriveUpload } from '@/lib/drive';
import { folderName, openRecordingFile, type FileSink } from '@/lib/localfolder';
import { isMobile, type Prefs } from '@/lib/prefs';

export type RecState = 'idle' | 'starting' | 'recording' | 'saving';

type StartOpts = {
  code: string;
  prefs: Prefs;
  micTrack?: MediaStreamTrack | null;
  /** Remote audio currently playing, so a phone recording can mix it in. */
  audioTracks: () => { sid: string; track: Track }[];
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Draws the star-field (every orb and any shared screen) onto a canvas so phones, which cannot capture a tab, can record too. */
function startCompositor(stage: HTMLElement) {
  const r0 = stage.getBoundingClientRect();
  const scale = Math.min(1, 1280 / Math.max(r0.width, 1));
  const cv = document.createElement('canvas');
  cv.width = Math.max(2, Math.round((r0.width * scale) / 2) * 2);
  cv.height = Math.max(2, Math.round((r0.height * scale) / 2) * 2);
  const ctx = cv.getContext('2d')!;
  // A worker keeps ticking when the tab is in the background, so the recording does not freeze when the host switches tabs.
  const worker = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(1),40)'], { type: 'text/javascript' })));

  // Fixed star positions so the recording looks like the meeting, not an empty black frame.
  const stars = Array.from({ length: 70 }, (_, i) => {
    const a = Math.sin(i * 12.9898) * 43758.5453;
    const b = Math.sin(i * 78.233) * 12543.123;
    return { x: a - Math.floor(a), y: b - Math.floor(b), r: 0.6 + ((i * 7) % 5) * 0.35, o: 0.35 + ((i * 3) % 6) / 10 };
  });
  const draw = () => {
    const sr = stage.getBoundingClientRect();
    const k = cv.width / Math.max(sr.width, 1);
    ctx.fillStyle = '#0b0b0f';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const bg = ctx.createRadialGradient(cv.width * 0.5, cv.height * 0.45, 10, cv.width * 0.5, cv.height * 0.5, Math.max(cv.width, cv.height) * 0.7);
    bg.addColorStop(0, 'rgba(139,92,246,.20)');
    bg.addColorStop(0.55, 'rgba(244,114,182,.07)');
    bg.addColorStop(1, 'rgba(11,11,15,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cv.width, cv.height);
    stars.forEach((st) => {
      ctx.fillStyle = `rgba(255,255,255,${st.o})`;
      ctx.beginPath();
      ctx.arc(st.x * cv.width, st.y * cv.height, st.r, 0, Math.PI * 2);
      ctx.fill();
    });
    stage.querySelectorAll<HTMLElement>('.screen, .orb').forEach((el) => {
      const r = el.getBoundingClientRect();
      const x = (r.left - sr.left) * k;
      const y = (r.top - sr.top) * k;
      const w = r.width * k;
      const h = r.height * k;
      const video = el.querySelector('video');
      ctx.save();
      if (el.classList.contains('screen')) {
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, w, h);
        if (video && video.readyState >= 2) {
          const ar = video.videoWidth / Math.max(video.videoHeight, 1);
          const dw = Math.min(w, h * ar);
          ctx.drawImage(video, x + (w - dw) / 2, y, dw, dw / ar);
        }
        ctx.restore();
        return;
      }
      const tile = el.classList.contains('is-tile');
      ctx.beginPath();
      if (tile) ctx.roundRect(x, y, w, h, 14 * k);
      else ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
      ctx.clip();
      if (video && video.readyState >= 2 && !video.classList.contains('hidden') && !el.classList.contains('no-video')) {
        const vw = video.videoWidth || 1;
        const vh = video.videoHeight || 1;
        const s = Math.max(w / vw, h / vh);
        const mirror = video.classList.contains('mirror');
        if (mirror) {
          ctx.translate(x + w, y);
          ctx.scale(-1, 1);
          ctx.drawImage(video, (w - vw * s) / 2, (h - vh * s) / 2, vw * s, vh * s);
        } else ctx.drawImage(video, x + (w - vw * s) / 2, y + (h - vh * s) / 2, vw * s, vh * s);
      } else {
        const face = el.querySelector<HTMLElement>('.orb-face');
        const hue = getComputedStyle(el).getPropertyValue('--h') || '28';
        const g = ctx.createRadialGradient(x + w * 0.3, y + h * 0.25, 2, x + w / 2, y + h / 2, Math.max(w, h) * 0.7);
        g.addColorStop(0, `hsl(${hue} 85% 70%)`);
        g.addColorStop(0.6, `hsl(${hue} 65% 38%)`);
        g.addColorStop(1, `hsl(${hue} 60% 20%)`);
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
        const img = face?.querySelector('img');
        if (img && img.complete && img.naturalWidth) ctx.drawImage(img, x, y, w, h);
        else {
          ctx.fillStyle = 'rgba(255,255,255,.94)';
          ctx.font = `600 ${Math.round(Math.min(w, h) * 0.32)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(el.querySelector('.orb-initials')?.textContent || '', x + w / 2, y + h / 2);
        }
      }
      ctx.restore();
      if (el.classList.contains('is-speaking')) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = 3 * k;
        ctx.beginPath();
        if (tile) ctx.roundRect(x, y, w, h, 14 * k);
        else ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2 + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (el.classList.contains('is-host') && !tile) {
        ctx.save();
        ctx.font = `700 ${Math.max(9, 10 * k)}px sans-serif`;
        const hw = ctx.measureText('HOST').width + 16;
        ctx.fillStyle = '#f2c14e';
        ctx.beginPath();
        ctx.roundRect(x + w / 2 - hw / 2, y - 8, hw, 16, 8);
        ctx.fill();
        ctx.fillStyle = '#1b1405';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('HOST', x + w / 2, y);
        ctx.restore();
      }
      const name = el.querySelector('.orb-name-text')?.textContent || '';
      if (name) {
        ctx.save();
        ctx.font = `500 ${Math.max(11, 12 * k)}px sans-serif`;
        const tw = ctx.measureText(name).width + 16;
        const nx = tile ? x + 8 : x + w / 2 - tw / 2;
        const ny = tile ? y + h - 28 : y + h + 8;
        ctx.fillStyle = 'rgba(5,6,12,.7)';
        ctx.beginPath();
        ctx.roundRect(nx, ny, tw, 20, 10);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, nx + 8, ny + 10);
        ctx.restore();
      }
    });
  };
  worker.onmessage = draw;
  return { stream: cv.captureStream(25), stop: () => worker.terminate() };
}

/**
 * Records the meeting from inside the page: the stage is drawn onto a canvas and every voice is mixed in, so nobody has to pick a screen to share.
 * Chunks stream to Google Drive and/or a folder on the computer, in a folder per day.
 */
export function useRecorder(onChange: (on: boolean) => void) {
  const [state, setState] = useState<RecState>('idle');
  const [note, setNote] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const cleanups = useRef<(() => void)[]>([]);
  const drive = useRef<DriveUpload | null>(null);
  const sink = useRef<FileSink | null>(null);
  const keep = useRef<Blob[]>([]);
  const writeQ = useRef<Promise<unknown>>(Promise.resolve());

  const cleanup = useCallback(() => {
    cleanups.current.forEach((f) => {
      try {
        f();
      } catch {
        /* ignore */
      }
    });
    cleanups.current = [];
  }, []);

  const stop = useCallback(() => {
    if (recRef.current && recRef.current.state !== 'inactive') {
      setState('saving');
      recRef.current.stop();
    }
  }, []);

  const start = useCallback(
    async (o: StartOpts) => {
      setNote(null);
      setLink(null);
      if (typeof MediaRecorder === 'undefined') return setNote('This browser cannot record. Use a recent Chrome, Edge or Safari.');
      const mobile = isMobile();
      const hasFolder = !mobile && Boolean(await folderName());
      // A chosen folder always receives the recording; Drive is added when linked (or when it is the only choice).
      const wantFolder = !mobile && (o.prefs.recordTo !== 'drive' || hasFolder || !clientId());
      const wantDrive = mobile ? true : o.prefs.recordTo !== 'folder' && Boolean(clientId());
      setState('starting');
      const d = new Date();
      const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const mime = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      const name = `Dense Meet ${pad(d.getHours())}-${pad(d.getMinutes())} (${o.code}).${ext}`;
      const notes: string[] = [];

      try {
        // Destinations first: both need a click, which we still have here.
        drive.current = null;
        sink.current = null;
        if (wantDrive) {
          if (!clientId()) {
            notes.push('Google Drive is not linked, so the recording will download to this device when you stop.');
          } else {
            try {
              if (!driveLinked()) await driveToken(true);
              drive.current = await startDriveUpload(name, mime || 'video/webm', day);
            } catch {
              notes.push('Could not reach Google Drive, so the recording will download to this device when you stop.');
            }
          }
        }
        if (wantFolder) {
          try {
            sink.current = await openRecordingFile(day, name);
          } catch {
            notes.push('Pick a recording folder in Settings.');
          }
        }

        // Picture and sound.
        const ctx = new AudioContext();
        cleanups.current.push(() => ctx.close().catch(() => {}));
        const dest = ctx.createMediaStreamDestination();
        let videoTracks: MediaStreamTrack[] = [];

        {
          const stage = document.querySelector<HTMLElement>('.stage');
          if (!stage) throw new Error('Open the meeting stage first.');
          const comp = startCompositor(stage);
          cleanups.current.push(comp.stop);
          videoTracks = comp.stream.getVideoTracks();
          const seen = new Set<string>();
          const sync = () => {
            o.audioTracks().forEach((a) => {
              if (seen.has(a.sid) || !a.track.mediaStreamTrack) return;
              seen.add(a.sid);
              ctx.createMediaStreamSource(new MediaStream([a.track.mediaStreamTrack])).connect(dest);
            });
          };
          sync();
          const iv = setInterval(sync, 1500);
          cleanups.current.push(() => clearInterval(iv));
          try {
            const wl = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen');
            if (wl) cleanups.current.push(() => wl.release().catch(() => {}));
          } catch {
            /* optional */
          }
        }
        if (o.micTrack && o.micTrack.readyState === 'live') ctx.createMediaStreamSource(new MediaStream([o.micTrack])).connect(dest);

        const stream = new MediaStream([...videoTracks, ...dest.stream.getAudioTracks()]);
        const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: mobile ? 1_800_000 : 3_000_000, audioBitsPerSecond: 128_000 });
        keep.current = [];
        writeQ.current = Promise.resolve();
        const storing = Boolean(drive.current || sink.current);
        rec.ondataavailable = (e) => {
          if (!e.data.size) return;
          drive.current?.push(e.data);
          writeQ.current = writeQ.current.then(() => sink.current?.write(e.data)).catch(() => {});
          if (!storing) keep.current.push(e.data);
        };
        rec.onstop = async () => {
          cleanup();
          onChange(false);
          let saved = '';
          if (sink.current) {
            await writeQ.current;
            await sink.current.close().catch(() => {});
            saved = 'folder';
          }
          if (drive.current) {
            const out = await drive.current.finish().catch(() => null);
            if (out) {
              setLink(out.link);
              saved = 'drive';
            } else setNote('The upload to Drive did not finish. Check your Drive storage.');
          }
          if (!storing && keep.current.length) {
            const blob = new Blob(keep.current, { type: mime || 'video/webm' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          }
          if (saved === 'folder') setNote('Recording saved in your recordings folder.');
          keep.current = [];
          drive.current = null;
          sink.current = null;
          recRef.current = null;
          setState('idle');
        };
        recRef.current = rec;
        rec.start(4000);
        setState('recording');
        onChange(true);
        if (notes.length) setNote(notes.join(' '));
      } catch (e) {
        cleanup();
        drive.current = null;
        sink.current = null;
        setState('idle');
        setNote(e instanceof Error && e.message && e.name !== 'NotAllowedError' ? e.message : 'Recording was cancelled.');
      }
    },
    [cleanup, onChange, stop],
  );

  useEffect(
    () => () => {
      if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
      cleanup();
    },
    [cleanup],
  );

  return { state, note, link, start, stop, clearNote: () => setNote(null) };
}
