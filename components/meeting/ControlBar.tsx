'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Captions,
  Check,
  Copy,
  Hand,
  LayoutGrid,
  MessageSquare,
  Mic,
  MicOff,
  MoreVertical,
  MonitorUp,
  PhoneOff,
  Settings,
  Smile,
  Sparkles,
  Users,
  Video,
  VideoOff,
  FileText,
  PowerOff,
  Circle,
  Square,
  ClipboardList,
  ChevronUp,
} from 'lucide-react';
import type { LayoutMode, PInfo } from '@/lib/types';
import DeviceMenu from './DeviceMenu';
import { cx } from '@/lib/util';

export type PanelId = 'chat' | 'people' | 'notes' | 'helper' | 'interview';

type Props = {
  me?: PInfo;
  roomCode: string;
  clock: string;
  canShare: boolean;
  sharing: boolean;
  isHost: boolean;
  canNotes: boolean;
  canInterview: boolean;
  waitingCount: number;
  notesOn: boolean;
  panel: PanelId | null;
  unread: number;
  peopleCount: number;
  mode: LayoutMode;
  captionsOn: boolean;
  onMic: () => void;
  onCam: () => void;
  onShare: () => void;
  onHand: () => void;
  onReact: (emoji: string) => void;
  onLeave: () => void;
  onEnd: () => void;
  onPanel: (p: PanelId) => void;
  onMode: (m: LayoutMode) => void;
  onCaptions: () => void;
  onSettings: () => void;
  onSwitch: (kind: MediaDeviceKind, id: string) => void;
  layoutAll: boolean;
  onLayoutAll: () => void;
  canLayoutAll: boolean;
  canRecord: boolean;
  recording: boolean;
  onRecord: () => void;
  onCopyLink: () => Promise<boolean>;
};

const EMOJIS = ['👍', '👏', '🎉', '❤️', '😂', '😮'];

export default function ControlBar(p: Props) {
  const [open, setOpen] = useState<'react' | 'more' | 'mic' | 'cam' | null>(null);
  const [copied, setCopied] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const micOn = p.me?.micOn ?? false;
  const camOn = p.me?.camOn ?? false;
  const hand = p.me?.hand ?? false;

  const copy = async () => {
    const ok = await p.onCopyLink();
    setCopied(ok);
    setTimeout(() => setCopied(false), 1800);
  };

  const panels: { id: PanelId; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'people', label: 'People', icon: <Users />, badge: p.waitingCount || p.peopleCount },
    { id: 'chat', label: 'Chat', icon: <MessageSquare />, badge: p.unread },
    ...(p.canInterview ? [{ id: 'interview' as PanelId, label: 'Interview', icon: <ClipboardList /> }] : []),
    ...(p.canNotes ? [{ id: 'notes' as PanelId, label: 'AI notes', icon: <FileText /> }] : []),
    { id: 'helper', label: 'AI Helper', icon: <Sparkles /> },
  ];

  return (
    <div className="controlbar" ref={wrap}>
      <div className="cb-left desk-only">
        <span className="cb-clock">{p.clock}</span>
        <span className="cb-sep" />
        <button className="cb-code" type="button" onClick={copy} title="Copy invite link">
          {p.roomCode}
          {copied ? <Check /> : <Copy />}
        </button>
      </div>

      <div className="cb-center">
        <div className="pop-anchor split">
          <button className={cx('cbtn', !micOn && 'is-off')} type="button" onClick={p.onMic} aria-label={micOn ? 'Turn off microphone' : 'Turn on microphone'} aria-pressed={micOn}>
            {micOn ? <Mic /> : <MicOff />}
          </button>
          <button className={cx('cbtn-arrow', !micOn && 'is-off', open === 'mic' && 'is-active')} type="button" onClick={() => setOpen(open === 'mic' ? null : 'mic')} aria-label="Microphone and speaker settings" aria-expanded={open === 'mic'}>
            <ChevronUp />
          </button>
          {open === 'mic' && <DeviceMenu kinds={['audioinput', 'audiooutput']} onSwitch={p.onSwitch} />}
        </div>
        <div className="pop-anchor split">
          <button className={cx('cbtn', !camOn && 'is-off')} type="button" onClick={p.onCam} aria-label={camOn ? 'Turn off camera' : 'Turn on camera'} aria-pressed={camOn}>
            {camOn ? <Video /> : <VideoOff />}
          </button>
          <button className={cx('cbtn-arrow', !camOn && 'is-off', open === 'cam' && 'is-active')} type="button" onClick={() => setOpen(open === 'cam' ? null : 'cam')} aria-label="Camera settings" aria-expanded={open === 'cam'}>
            <ChevronUp />
          </button>
          {open === 'cam' && <DeviceMenu kinds={['videoinput']} onSwitch={p.onSwitch} />}
        </div>
        {p.canShare && (
          <button className={cx('cbtn', p.sharing && 'is-active')} type="button" onClick={p.onShare} aria-label={p.sharing ? 'Stop presenting' : 'Present your screen'} aria-pressed={p.sharing}>
            <MonitorUp />
          </button>
        )}
        <div className="pop-anchor">
          <button className={cx('cbtn', open === 'react' && 'is-active')} type="button" onClick={() => setOpen(open === 'react' ? null : 'react')} aria-label="Send a reaction" aria-expanded={open === 'react'}>
            <Smile />
          </button>
          {open === 'react' && (
            <div className="popover emoji-pop" role="menu">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  role="menuitem"
                  aria-label={`React ${e}`}
                  onClick={() => {
                    p.onReact(e);
                    setOpen(null);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className={cx('cbtn', hand && 'is-gold')} type="button" onClick={p.onHand} aria-label={hand ? 'Lower hand' : 'Raise hand'} aria-pressed={hand}>
          <Hand />
        </button>
        <div className="pop-anchor">
          <button className={cx('cbtn', open === 'more' && 'is-active')} type="button" onClick={() => setOpen(open === 'more' ? null : 'more')} aria-label="More options" aria-expanded={open === 'more'}>
            <MoreVertical />
            {p.unread > 0 && <span className="dot mob-only" />}
          </button>
          {open === 'more' && (
            <div className="popover more-pop" role="menu">
              <div className="seg" role="group" aria-label="Layout">
                {(['star', 'grid', 'speaker'] as LayoutMode[]).map((m) => (
                  <button key={m} type="button" className={cx(p.mode === m && 'on')} onClick={() => p.onMode(m)}>
                    {m === 'star' ? 'Star' : m === 'grid' ? 'Grid' : 'Speaker'}
                  </button>
                ))}
              </div>
              {p.canLayoutAll && (
                <label className="menu-item check">
                  <input type="checkbox" checked={p.layoutAll} onChange={p.onLayoutAll} />
                  <span>Apply layout to everyone</span>
                </label>
              )}
              <button type="button" role="menuitem" className="menu-item" onClick={() => { p.onCaptions(); setOpen(null); }}>
                <Captions /> {p.captionsOn ? 'Hide captions' : 'Show captions'}
              </button>
              {p.canRecord && (
                <button type="button" role="menuitem" className="menu-item" onClick={() => { p.onRecord(); setOpen(null); }}>
                  {p.recording ? <Square /> : <Circle />} {p.recording ? 'Stop recording' : 'Start recording'}
                </button>
              )}
              <button type="button" role="menuitem" className="menu-item" onClick={() => { p.onSettings(); setOpen(null); }}>
                <Settings /> Profile, recording and more
              </button>
              <button type="button" role="menuitem" className="menu-item" onClick={copy}>
                {copied ? <Check /> : <Copy />} {copied ? 'Link copied' : 'Copy invite link'}
              </button>
              <div className="menu-sep mob-only" />
              {panels.map((x) => (
                <button key={x.id} type="button" role="menuitem" className="menu-item mob-only" onClick={() => { p.onPanel(x.id); setOpen(null); }}>
                  {x.icon} {x.label}
                  {x.badge ? <span className="count">{x.badge}</span> : null}
                </button>
              ))}
              {p.isHost && (
                <>
                  <div className="menu-sep" />
                  <button type="button" role="menuitem" className="menu-item danger" onClick={() => { p.onEnd(); setOpen(null); }}>
                    <PowerOff /> End meeting for everyone
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <button className="cbtn leave" type="button" onClick={p.onLeave} aria-label="Leave meeting">
          <PhoneOff />
        </button>
      </div>

      <div className="cb-right desk-only">
        <button className={cx('cb-layout')} type="button" onClick={() => p.onMode(p.mode === 'star' ? 'grid' : p.mode === 'grid' ? 'speaker' : 'star')} aria-label="Change layout" title={`Layout: ${p.mode}`}>
          <LayoutGrid />
        </button>
        {panels.map((x) => (
          <button key={x.id} className={cx('cb-panel', p.panel === x.id && 'on')} type="button" onClick={() => p.onPanel(x.id)} aria-label={x.label} aria-pressed={p.panel === x.id} title={x.label}>
            {x.icon}
            {x.badge ? <span className="count">{x.badge}</span> : null}
            {x.id === 'notes' && p.notesOn && <span className="dot live" />}
          </button>
        ))}
      </div>
    </div>
  );
}
