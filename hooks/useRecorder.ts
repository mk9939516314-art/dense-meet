'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clientId, driveLinked, startDriveUpload, type DriveUpload } from '@/lib/drive';

export type RecState = 'idle' | 'starting' | 'recording' | 'saving';

/**
 * Records this browser tab (the star-field and everyone's sound) with the host's own mic mixed in.
 * Chunks stream to the host's Google Drive when it is linked, otherwise the file downloads at the end.
 */
export function useRecorder(onChange: (on: boolean) => void) {
  const [state, setState] = useState<RecState>('idle');
  const [note, setNote] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const driveRef = useRef<DriveUpload | null>(null);
  const chunks = useRef<Blob[]>([]);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  const stop = useCallback(() => {
    if (recRef.current && recRef.current.state !== 'inactive') {
      setState('saving');
      recRef.current.stop();
    }
  }, []);

  const start = useCallback(
    async (micTrack?: MediaStreamTrack | null) => {
      setNote(null);
      setLink(null);
      if (!navigator.mediaDevices || !('getDisplayMedia' in navigator.mediaDevices) || typeof MediaRecorder === 'undefined') {
        setNote('Recording needs a desktop browser such as Chrome or Edge.');
        return;
      }
      setState('starting');
      try {
        const display = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 },
          audio: true,
          // Chrome: offer this tab first so the host just clicks Share.
          ...({ preferCurrentTab: true, selfBrowserSurface: 'include', systemAudio: 'include' } as object),
        });
        // Mix tab audio and the host's microphone into one track.
        const ctx = new AudioContext();
        ctxRef.current = ctx;
        const dest = ctx.createMediaStreamDestination();
        if (display.getAudioTracks().length) ctx.createMediaStreamSource(new MediaStream([display.getAudioTracks()[0]])).connect(dest);
        if (micTrack && micTrack.readyState === 'live') ctx.createMediaStreamSource(new MediaStream([micTrack])).connect(dest);
        const stream = new MediaStream([...display.getVideoTracks(), ...dest.stream.getAudioTracks()]);
        streamRef.current = display;

        const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
        const name = `Dense Meet ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.webm`;
        driveRef.current = null;
        if (clientId() && driveLinked()) {
          try {
            driveRef.current = await startDriveUpload(name, mime || 'video/webm');
          } catch {
            setNote('Could not reach Google Drive. The recording will download to this device instead.');
          }
        }

        const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 128_000 });
        chunks.current = [];
        rec.ondataavailable = (e) => {
          if (!e.data.size) return;
          if (driveRef.current) driveRef.current.push(e.data);
          chunks.current.push(e.data);
          // Keep memory small once Drive is receiving the data.
          if (driveRef.current && !driveRef.current.failed()) chunks.current = [];
        };
        rec.onstop = async () => {
          const d = driveRef.current;
          cleanup();
          onChange(false);
          if (d) {
            const out = await d.finish().catch(() => null);
            if (out) setLink(out.link);
            else setNote('Upload to Drive did not finish. Check your Drive storage.');
          } else {
            const blob = new Blob(chunks.current, { type: mime || 'video/webm' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          }
          chunks.current = [];
          driveRef.current = null;
          recRef.current = null;
          setState('idle');
        };
        // Stopping the browser's own "sharing" bar ends the recording cleanly.
        display.getVideoTracks()[0].addEventListener('ended', () => stop());
        recRef.current = rec;
        rec.start(4000);
        setState('recording');
        onChange(true);
      } catch {
        cleanup();
        setState('idle');
        setNote('Recording was cancelled.');
      }
    },
    [cleanup, onChange, stop],
  );

  useEffect(() => () => {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
    cleanup();
  }, [cleanup]);

  return { state, note, link, start, stop, clearNote: () => setNote(null) };
}
