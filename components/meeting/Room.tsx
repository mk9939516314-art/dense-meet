'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronUp, MessageSquare, Users, Camera, Hourglass, Mic, Sparkles, UserCheck, Volume2, WifiOff, X } from 'lucide-react';
import type { useMeeting } from '@/hooks/useMeeting';
import { useTranscription } from '@/hooks/useTranscription';
import { useRecorder } from '@/hooks/useRecorder';
import { loadPrefs } from '@/lib/prefs';
import SettingsModal from '../SettingsModal';
import { usePresence } from '@/lib/usePresence';
import type { LayoutMode } from '@/lib/types';
import { cx, mmss } from '@/lib/util';
import Starfield from '../Starfield';
import ControlBar, { type PanelId } from './ControlBar';
import Stage from './Stage';
import { AudioPlayer } from './media';
import ChatPanel from './panels/ChatPanel';
import HelperPanel from './panels/HelperPanel';
import NotesPanel from './panels/NotesPanel';
import InterviewPanel from './panels/InterviewPanel';
import QuestionCard from './QuestionCard';
import PeoplePanel, { Avatar } from './panels/PeoplePanel';

type Meeting = ReturnType<typeof useMeeting>;

const TITLES: Record<PanelId, string> = { chat: 'Chat', people: 'People', notes: 'AI notes', helper: 'AI Helper', interview: 'Interview' };

export default function Room({ m, roomCode, aiConfigured }: { m: Meeting; roomCode: string; aiConfigured: boolean | null }) {
  const [mode, setMode] = useState<LayoutMode>('star');
  const [panel, setPanel] = useState<PanelId | null>(null);
  const lastPanel = useRef<PanelId>('chat');
  if (panel) lastPanel.current = panel;
  const panelPres = usePresence(panel !== null, 170);
  const shownPanel: PanelId | null = panelPres.mounted ? (panel ?? lastPanel.current) : null;
  const panelOut = panelPres.closing;
  const [pinned, setPinned] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const endPres = usePresence(confirmEnd, 170);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [myNotes, setMyNotes] = useState(true);
  const [lang, setLang] = useState('en-IN');
  const [interim, setInterim] = useState('');
  const [seen, setSeen] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [layoutAll, setLayoutAll] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const handsRef = useRef<Set<string>>(new Set());

  const audioRef = useRef(m.audioTracks);
  audioRef.current = m.audioTracks;
  const [moreSettings, setMoreSettings] = useState(false);
  const rec = useRecorder(m.setRecording);
  useEffect(() => setMode(loadPrefs().layout), []);
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

  // Someone changed the layout for everyone: follow it once, and the person stays free to change it again.
  useEffect(() => {
    if (m.layoutPush && !m.isHost) {
      setMode(m.layoutPush.mode as LayoutMode);
      setToast(`${m.layoutPush.from} switched everyone to ${m.layoutPush.mode} view`);
      const id = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(id);
    }
  }, [m.layoutPush, m.isHost]);

  const changeMode = useCallback(
    (next: LayoutMode) => {
      setMode(next);
      if (layoutAll && m.can('interview')) m.sendLayout(next);
    },
    [layoutAll, m],
  );

  // A raised hand gets its own short, friendly alert for the host and role holders.
  useEffect(() => {
    const now = new Set(m.participants.filter((p) => p.hand).map((p) => p.identity));
    if (m.can('mute')) {
      m.participants.forEach((p) => {
        if (p.hand && !handsRef.current.has(p.identity) && !p.isLocal) {
          setToast(`${p.name} raised a hand`);
          setTimeout(() => setToast((t) => (t === `${p.name} raised a hand` ? null : t)), 4000);
        }
      });
    }
    handsRef.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.participants]);

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

  if (m.isWaiting) {
    return (
      <div className="room">
        <Starfield />
        <div className="ended waiting-screen">
          <div className="ended-card">
            <span className="ended-icon pulse"><Hourglass /></span>
            <h1>Waiting for the host</h1>
            <p className="muted">{m.me?.blocked ? 'You were removed earlier, so the host has to let you back in.' : 'The host will let you in shortly.'} Your camera and microphone stay off until then.</p>
            <div className="wait-list" aria-label="People waiting">
              <b>Waiting ({m.waitingAll.length})</b>
              <ul>
                {m.waitingAll.map((w) => (
                  <li key={w.identity}><Avatar p={w} /> <span>{w.name}{w.isLocal ? ' (you)' : ''}</span></li>
                ))}
              </ul>
            </div>
            <button className="btn-ghost" type="button" onClick={m.leave}>Leave</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`room${immersive ? ' immersive' : ''}`}>
      <Starfield />

      <div className="room-main">
        <div
          className="stage-wrap"
          onClick={(e) => {
            const t = e.target as HTMLElement;
            if (t.classList.contains('stage') || t.classList.contains('stage-wrap')) setImmersive((v) => !v);
          }}
        >
          <div className="mob-top">
            <button type="button" className="mob-fab" onClick={() => togglePanel('people')} aria-label="People">
              <Users />
              {(m.can('admit') ? m.waiting.length : 0) > 0 ? <span className="count">{m.waiting.length}</span> : null}
            </button>
            <button type="button" className="mob-fab" onClick={() => togglePanel('chat')} aria-label="Chat">
              <MessageSquare />
              {unread > 0 && <span className="count">{unread}</span>}
            </button>
          </div>
          {immersive && (
            <button type="button" className="mob-reveal" onClick={() => setImmersive(false)} aria-label="Show controls">
              <ChevronUp />
            </button>
          )}
          <Stage participants={m.participants} mode={mode} pinned={pinned} onPin={setPinned} reactions={m.reactions} bottomPad={20} />

          <div className="status-chips">
            {m.notesOn && (
              <span className="chip live">
                <i className="dot live" /> AI notes on
              </span>
            )}
            {m.recording && (
              <span className="chip rec">
                <i className="dot" /> Recording
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
          {rec.note && (
            <div className="banner">
              <AlertTriangle /> {rec.note}
              <button className="btn-icon small" type="button" onClick={rec.clearNote} aria-label="Dismiss"><X /></button>
            </div>
          )}
          {rec.link && (
            <a className="toast action" href={rec.link} target="_blank" rel="noreferrer">Recording saved to Google Drive <b>Open</b></a>
          )}
          {m.mediaNote && (
            <div className="banner">
              <AlertTriangle /> {m.mediaNote}
              <button className="btn-icon small" type="button" onClick={m.clearMediaNote} aria-label="Dismiss">
                <X />
              </button>
            </div>
          )}
          {m.questions.length > 0 && (
            <div className="qstack">
              {m.questions.map((q) => (
                <QuestionCard key={q.id} q={q} onDismiss={() => m.dismissQuestion(q.id)} />
              ))}
            </div>
          )}
          {m.can('admit') && m.waitingToast && (
            <button className="toast action" type="button" onClick={() => setPanel('people')}>
              <UserCheck /> {m.waitingToast} <b>Review</b>
            </button>
          )}
          {m.ask && (
            <div className="ask-card" role="alertdialog" aria-label="Request from host">
              <span className="ask-ic">{m.ask.kind === 'mic' ? <Mic /> : <Camera />}</span>
              <div>
                <strong>{m.ask.from} asks you to turn on your {m.ask.kind === 'mic' ? 'microphone' : 'camera'}</strong>
                <span className="muted tiny">It only turns on if you accept.</span>
              </div>
              <div className="row-gap">
                <button className="btn-ghost small" type="button" onClick={() => m.answerAsk(false)}>Not now</button>
                <button className="btn-primary small" type="button" onClick={() => m.answerAsk(true)}>Turn on</button>
              </div>
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

        {shownPanel && (
          <>
            <div className={cx('sheet-back', panelOut && 'is-closing')} onClick={() => setPanel(null)} />
            <aside className={cx('side', panelOut && 'is-closing')} aria-label={TITLES[shownPanel]}>
              <header className="side-head">
                <h2>{TITLES[shownPanel]}</h2>
                <button className="btn-icon" type="button" onClick={() => setPanel(null)} aria-label="Close panel">
                  <X />
                </button>
              </header>
              <div className="side-body">
                {shownPanel === 'chat' && <ChatPanel chat={m.chat} onSend={m.sendChat} />}
                {shownPanel === 'people' && (
                  <PeoplePanel
                    participants={m.participants}
                    waiting={m.waiting}
                    roomState={m.roomState}
                    isHost={m.isHost}
                    can={m.can}
                    onAct={m.hostAction}
                    onAsk={m.askMedia}
                  />
                )}
                {shownPanel === 'notes' && m.can('notes') && (
                  <NotesPanel
                    isHost={m.can('notes')}
                    interview={m.roomState.interview}
                    roomCode={roomCode}
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
                {shownPanel === 'interview' && m.can('interview') && (
                  <InterviewPanel
                    participants={m.participants}
                    token={m.token}
                    tx={m.tx}
                    startedAt={m.startedAt}
                    configured={aiConfigured}
                    notesOn={m.notesOn}
                    onToggleNotes={m.setNotes}
                    onPush={m.pushQuestion}
                    onClear={m.clearQuestion}
                    onNote={m.addQuestionNote}
                  />
                )}
                {shownPanel === 'helper' && <HelperPanel token={m.token} configured={aiConfigured} />}
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
        canNotes={m.can('notes')}
        canInterview={m.can('interview') && m.roomState.interview}
        waitingCount={m.can('admit') ? m.waiting.length : 0}
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
        onMode={changeMode}
        layoutAll={layoutAll}
        onLayoutAll={() => setLayoutAll((v) => !v)}
        canLayoutAll={m.can('interview')}
        onCaptions={() => setCaptionsOn((v) => !v)}
        canRecord={m.can('record')}
        recording={rec.state === 'recording' || rec.state === 'starting'}
        onRecord={() => (rec.state === 'recording' ? rec.stop() : rec.start({ code: roomCode, prefs: loadPrefs(), micTrack: m.getMicTrack(), audioTracks: () => audioRef.current }))}
        onSettings={() => setMoreSettings(true)}
        onSwitch={m.switchDevice}
        onCopyLink={copyLink}
      />

      {m.audioTracks.map((a) => (
        <AudioPlayer key={a.sid} track={a.track} />
      ))}

      {moreSettings && <SettingsModal inMeeting start="recording" onClose={() => setMoreSettings(false)} />}

      {endPres.mounted && (
        <div className={cx('modal-back', endPres.closing && 'is-closing')} onPointerDown={(e) => e.target === e.currentTarget && setConfirmEnd(false)}>
          <div className={cx('modal', endPres.closing && 'is-closing')} role="alertdialog" aria-modal="true" aria-label="End meeting for everyone">
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
