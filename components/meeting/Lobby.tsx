'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Camera, Loader2, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { loadPrefs } from '@/lib/prefs';
import { HUES, fileToAvatar, loadProfile, saveProfile } from '@/lib/profile';
import { cx, hashHue, initials } from '@/lib/util';

type Dev = { id: string; label: string };

export type LobbyResult = { name: string; micOn: boolean; camOn: boolean; micId?: string; camId?: string; hue: number | null; pic: string };

type Props = {
  roomCode: string;
  isHost: boolean;
  busy: boolean;
  error: string | null;
  onJoin: (r: LobbyResult) => void;
};

export default function Lobby({ roomCode, isHost, busy, error, onJoin }: Props) {
  const [name, setName] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [mics, setMics] = useState<Dev[]>([]);
  const [cams, setCams] = useState<Dev[]>([]);
  const [micId, setMicId] = useState('');
  const [camId, setCamId] = useState('');
  const [permNote, setPermNote] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [level, setLevel] = useState(0);
  const [hueSel, setHueSel] = useState<number | null>(null);
  const [pic, setPic] = useState('');

  useEffect(() => {
    const pf = loadPrefs();
    setMicOn(pf.defaultMic);
    setCamOn(pf.defaultCam);
    const pr = loadProfile();
    setName(pr.name);
    setHueSel(pr.hue);
    setPic(pr.pic);
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    setPermNote(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermNote('This browser cannot access a camera or microphone. Open the link in Chrome, Edge or Safari.');
      return;
    }
    if (!micOn && !camOn) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micOn ? { deviceId: micId ? { exact: micId } : undefined, echoCancellation: true, noiseSuppression: true } : false,
        video: camOn ? { deviceId: camId ? { exact: camId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
      });
      streamRef.current = stream;
      if (videoRef.current && camOn) videoRef.current.srcObject = stream;
      const devs = await navigator.mediaDevices.enumerateDevices();
      setMics(devs.filter((d) => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` })));
      setCams(devs.filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })));
    } catch {
      setPermNote('Camera or microphone is blocked. You can still join and allow access from your browser settings later.');
    }
  }, [micOn, camOn, micId, camId, stop]);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  // Simple mic level meter so people know their microphone works before joining.
  useEffect(() => {
    const stream = streamRef.current;
    if (!micOn || !stream || stream.getAudioTracks().length === 0) {
      setLevel(0);
      return;
    }
    let raf = 0;
    let ctx: AudioContext | null = null;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const loop = () => {
        an.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        setLevel(Math.min(1, sum / buf.length / 90));
        raf = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      /* meter is optional */
    }
    return () => {
      cancelAnimationFrame(raf);
      ctx?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micOn, micId, permNote, mics.length]);

  const join = () => {
    const n = name.trim() || (isHost ? 'Host' : 'Guest');
    saveProfile({ name: n, hue: hueSel, pic });
    stop();
    onJoin({ name: n, micOn, camOn, micId: micId || undefined, camId: camId || undefined, hue: hueSel, pic });
  };

  const hue = hueSel ?? hashHue(name || 'guest');
  const onPic = async (f?: File | null) => {
    if (!f) return;
    try {
      setPic(await fileToAvatar(f));
    } catch {
      setPermNote('That image could not be read. Try a JPG or PNG.');
    }
  };

  return (
    <main className="lobby">
      <div className="lobby-top">
        <Link href="/" className="back-link">
          <ArrowLeft /> Dense Meet
        </Link>
        <span className="chip">{roomCode}</span>
      </div>

      <div className="lobby-grid">
        <section className="preview-wrap">
          <div className={cx('preview', camOn && 'live')}>
            <video ref={videoRef} autoPlay playsInline muted className={cx('video mirror', !camOn && 'hidden')} />
            {!camOn && (
              <div className="preview-off">
                <span className="avatar xl" style={{ ['--h' as string]: hue } as React.CSSProperties}>
                  {pic ? <img src={pic} alt="" /> : initials(name || 'Guest')}
                </span>
                <span>Camera is off</span>
              </div>
            )}
            <div className="preview-controls">
              <button className={cx('cbtn', !micOn && 'is-off')} type="button" onClick={() => setMicOn(!micOn)} aria-label={micOn ? 'Turn off microphone' : 'Turn on microphone'} aria-pressed={micOn}>
                {micOn ? <Mic /> : <MicOff />}
              </button>
              <button className={cx('cbtn', !camOn && 'is-off')} type="button" onClick={() => setCamOn(!camOn)} aria-label={camOn ? 'Turn off camera' : 'Turn on camera'} aria-pressed={camOn}>
                {camOn ? <Video /> : <VideoOff />}
              </button>
            </div>
            {micOn && (
              <div className="meter" aria-hidden="true">
                <i style={{ transform: `scaleX(${level})` }} />
              </div>
            )}
          </div>
          {permNote && <div className="notice warn">{permNote}</div>}
        </section>

        <section className="join-card">
          <h1>{isHost ? 'Your meeting is ready' : 'Ready to join?'}</h1>
          <p className="muted">{isHost ? 'Check your camera and microphone, then start. Share the link so others can join.' : 'Check how you look and sound, then join.'}</p>

          <label className="field">
            <span>Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" maxLength={40} autoComplete="name" onKeyDown={(e) => e.key === 'Enter' && !busy && join()} />
          </label>

          <div className="profile-row">
            <label className="avatar-pick" title="Add a profile picture">
              <span className="avatar xl" style={{ ['--h' as string]: hue } as React.CSSProperties}>
                {pic ? <img src={pic} alt="Your profile picture" /> : initials(name || 'Guest')}
              </span>
              <span className="avatar-cam"><Camera /></span>
              <input type="file" accept="image/*" hidden onChange={(e) => onPic(e.target.files?.[0])} />
            </label>
            <div className="swatches" role="group" aria-label="Profile colour">
              {HUES.map((h) => (
                <button key={h} type="button" className={cx('swatch', hueSel === h && 'on')} style={{ ['--h' as string]: h } as React.CSSProperties} onClick={() => setHueSel(h)} aria-label={`Colour ${h}`} />
              ))}
              {pic && (
                <button type="button" className="btn-ghost small" onClick={() => setPic('')}>
                  Remove photo
                </button>
              )}
            </div>
          </div>

          {(mics.length > 1 || cams.length > 1) && (
            <div className="field-row">
              {mics.length > 1 && (
                <label className="field">
                  <span>Microphone</span>
                  <select value={micId} onChange={(e) => setMicId(e.target.value)}>
                    <option value="">Default</option>
                    {mics.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {cams.length > 1 && (
                <label className="field">
                  <span>Camera</span>
                  <select value={camId} onChange={(e) => setCamId(e.target.value)}>
                    <option value="">Default</option>
                    {cams.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {error && <div className="notice warn">{error}</div>}

          <button className="btn-primary big" type="button" onClick={join} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="spin" /> Connecting
              </>
            ) : isHost ? (
              'Start meeting'
            ) : (
              'Join now'
            )}
          </button>
        </section>
      </div>
    </main>
  );
}
