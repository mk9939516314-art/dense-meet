'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Sparkles, Volume2, WifiOff, X } from 'lucide-react';
import type { useMeeting } from '@/hooks/useMeeting';
import { useTranscription } from '@/hooks/useTranscription';
import type { LayoutMode } from '@/lib/types';
import { cx, mmss } from '@/lib/util';
import Starfield from '../Starfield';
import ControlBar, { type PanelId } from './ControlBar';
import SettingsDialog from './SettingsDialog';
import Stage from './Stage';
import { AudioPlayer } from './media';
import ChatPanel from './panels/ChatPanel';
import HelperPanel from './panels/HelperPanel';
import NotesPanel from './panels/NotesPanel';
import PeoplePanel from './panels/PeoplePanel';

type Meeting = ReturnType<typeof useMeeting>;

const TITLES: Record<PanelId, string> = { chat: 'Chat', people: 'People', notes: 'AI notes', helper: 'AI Helper' };

export default function Room({ m, roomCode, aiConfigured }: { m: Meeting; roomCode: string; aiConfigured: boolean | null }) {
  const [mode, setMode] = useState<LayoutMode>('star');
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [myNotes, setMyNotes] = useState(true);
  const [lang, setLang] = useState('en-IN');
  const [interim, setInterim] = useState('');
  const [seen, setSeen] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<string | null>(null);

  const canShare = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Default language from the browser if it looks like Hindi.
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('hi')) setLang('hi-IN');
  }, []);

  // Tell everyone when the host switches AI notes on or off.
  useEffect(() => {
    if (!m.isHost && m.phase === 'live') setToast(m.notesOn ? 'The host turned on AI notes. Your speech is transcribed in your browser.' : null);
    if (m.notesOn) {
      const id = setTimeout(() => setToast(null), 7000);
      return () => clearTimeout(id);
    }
  }, [m.notesOn, m.isHost, m.phase]);

  const transcribing = m.notesOn && myNotes && Boolean(m.me?.micOn);
  const { supported, blocked } = useTranscription({ enabled: transcribing, lang, onFinal: m.addOwnTranscript, onInterim: setInterim });

  const unread = panel === 'chat' ? 0 : Math.max(0, m.chat.filter((c) => !c.mine).length - seen);
  useEffect(() => {
    if (panel === 'chat') setSeen(m.chat.filter((c) => !c.mine).length);
  }, [panel, m.chat]);

  const togglePanel = useCallback((id: PanelId) => setPanel((cur) => (cur === id ? null : id)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'm') m.toggleMic();
      else if (k === 'v') m.toggleCam();
      else if (k === 'h') m.toggleHand();
      else if (k === 'c') togglePanel('chat');
      else if (k === 'escape') setPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [m, togglePanel]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${roomCode}`);
      return true;
    } catch {
      return false;
    }
  }, [roomCode]);

  // Live captions: the newest lines from the last few seconds, plus what you are saying right now.
  const captions = useMemo(() => m.tx.filter((s) => now - s.ts < 7000).slice(-2), [m.tx, now]);
  const hosts = m.participants.filter((p) => p.isHost).map((p) => p.name);

  return (
    <div className="room">
      <Starfield />

      <div className="room-main">
        <div className="stage-wrap">
          <Stage participants={m.participants} mode={mode} pinned={pinned} onPin={setPinned} reactions={m.reactions} bottomPad={20} />

          <div className="status-chips">
            {m.notesOn && (
              <span className="chip live">
                <i className="dot live" /> AI notes on
              </span>
            )}
            {m.reconnecting && (
              <span className="chip warn">
                <WifiOff /> Reconnecting
              </span>
            )}
            {pinned && (
              <button className="chip" type="button" onClick={() => setPinned(null)}>
                Pinned <X />
              </button>
            )}
          </div>

          {m.audioBlocked && (
            <button className="banner-btn" type="button" onClick={m.startAudio}>
              <Volume2 /> Tap to turn on sound
            </button>
          )}
          {m.mediaNote && (
            <div className="banner">
              <AlertTriangle /> {m.mediaNote}
              <button className="btn-icon small" type="button" onClick={m.clearMediaNote} aria-label="Dismiss">
                <X />
              </button>
            </div>
          )}
          {toast && (
            <div className="toast" role="status">
              <Sparkles /> {toast}
            </div>
          )}

          {captionsOn && m.notesOn && (captions.length > 0 || interim) && (
            <div className="captions" aria-live="polite">
              {captions.map((c) => (
                <p key={c.id}>
                  <b>{c.speaker}</b> {c.text}
                </p>
              ))}
              {interim && (
                <p className="interim-line">
                  <b>You</b> {interim}
                </p>
              )}
            </div>
          )}
        </div>

        {panel && (
          <>
            <div className="sheet-back" onClick={() => setPanel(null)} />
            <aside className="side" aria-label={TITLES[panel]}>
              <header className="side-head">
                <h2>{TITLES[panel]}</h2>
                <button className="btn-icon" type="button" onClick={() => setPanel(null)} aria-label="Close panel">
                  <X />
                </button>
              </header>
              <div className="side-body">
                {panel === 'chat' && <ChatPanel chat={m.chat} onSend={m.sendChat} />}
                {panel === 'people' && (
                  <PeoplePanel
                    participants={m.participants}
                    isHost={m.isHost}
                    onMute={(id) => m.hostAction('mute', id)}
                    onMuteAll={() => m.hostAction('muteAll')}
                    onRemove={(id) => m.hostAction('remove', id)}
                  />
                )}
                {panel === 'notes' && (
                  <NotesPanel
                    isHost={m.isHost}
                    notesOn={m.notesOn}
                    onToggleNotes={m.setNotes}
                    tx={m.tx}
                    participants={m.participants}
                    startedAt={m.startedAt}
                    token={m.token}
                    configured={aiConfigured}
                    supported={supported}
                    blocked={blocked}
                    myNotes={myNotes}
                    setMyNotes={setMyNotes}
                    lang={lang}
                    setLang={setLang}
                    interim={interim}
                  />
                )}
                {panel === 'helper' && <HelperPanel token={m.token} configured={aiConfigured} />}
              </div>
            </aside>
          </>
        )}
      </div>

      <ControlBar
        me={m.me}
        roomCode={roomCode}
        clock={mmss(now - (m.startedAt || now))}
        canShare={canShare}
        sharing={m.sharingScreen}
        isHost={m.isHost}
        notesOn={m.notesOn}
        panel={panel}
        unread={unread}
        peopleCount={m.participants.length}
        mode={mode}
        captionsOn={captionsOn}
        onMic={m.toggleMic}
        onCam={m.toggleCam}
        onShare={m.toggleScreen}
        onHand={m.toggleHand}
        onReact={m.sendReaction}
        onLeave={m.leave}
        onEnd={() => setConfirmEnd(true)}
        onPanel={togglePanel}
        onMode={setMode}
        onCaptions={() => setCaptionsOn((v) => !v)}
        onSettings={() => setSettings(true)}
        onCopyLink={copyLink}
      />

      {m.audioTracks.map((a) => (
        <AudioPlayer key={a.sid} track={a.track} />
      ))}

      {settings && <SettingsDialog onClose={() => setSettings(false)} onSwitch={m.switchDevice} />}

      {confirmEnd && (
        <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && setConfirmEnd(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-label="End meeting for everyone">
            <h2>End meeting for everyone?</h2>
            <p className="muted">
              Everyone will be disconnected{hosts.length ? '' : ''}. Chat and the transcript are not saved. Download the notes first if you need them.
            </p>
            <div className="row-gap end">
              <button className="btn-ghost" type="button" onClick={() => setConfirmEnd(false)}>
                Cancel
              </button>
              <button
                className={cx('btn-danger')}
                type="button"
                onClick={async () => {
                  setConfirmEnd(false);
                  await m.hostAction('end');
                }}
              >
                End for everyone
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
