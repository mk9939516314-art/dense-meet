'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DisconnectReason, Room, RoomEvent, Track, VideoPresets, type Participant } from 'livekit-client';
import type { ChatItem, PInfo, ReactionItem, RoomState, TxSeg } from '@/lib/types';
import { parseMeta, parseRoomMeta } from '@/lib/perms';
import { uid } from '@/lib/util';

export type Phase = 'idle' | 'connecting' | 'live' | 'ended';
export type EndReason = 'left' | 'removed' | 'ended' | 'error' | 'locked';
export type Question = { id: string; text: string; secs: number; at: number; from: string };
export type MediaAsk = { kind: 'mic' | 'cam'; from: string; id: string };

export type JoinParams = {
  token: string;
  url: string;
  micOn: boolean;
  camOn: boolean;
  micId?: string;
  camId?: string;
};

const NO_ROOM: RoomState = { wait: false, locked: false, interview: false };

export type AudioTrackRef = { sid: string; track: Track };

const enc = new TextEncoder();
const dec = new TextDecoder();

function snap(p: Participant): PInfo {
  const meta = parseMeta(p.metadata);
  const cam = p.getTrackPublication(Track.Source.Camera);
  const mic = p.getTrackPublication(Track.Source.Microphone);
  const scr = p.getTrackPublication(Track.Source.ScreenShare);
  return {
    identity: p.identity,
    name: p.name || 'Guest',
    isLocal: p.isLocal,
    isHost: meta.role === 'host',
    status: meta.status === 'waiting' ? 'waiting' : 'in',
    blocked: Boolean(meta.blocked),
    label: meta.label,
    perms: meta.perms || [],
    hue: meta.hue,
    pic: meta.pic,
    speaking: p.isSpeaking,
    level: p.audioLevel,
    micOn: Boolean(mic && !mic.isMuted),
    camOn: Boolean(cam && !cam.isMuted && cam.track),
    cam: cam?.track ?? undefined,
    screen: scr?.track ?? undefined,
    hand: p.attributes?.hand === '1',
    joinedAt: p.joinedAt ? p.joinedAt.getTime() : 0,
  };
}

export function useMeeting() {
  const roomRef = useRef<Room | null>(null);
  const tokenRef = useRef('');
  const leavingRef = useRef(false);
  const wantRef = useRef({ mic: false, cam: false });
  const wasWaitingRef = useRef(false);
  const kickedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [endReason, setEndReason] = useState<EndReason | null>(null);
  const [mediaNote, setMediaNote] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [tx, setTx] = useState<TxSeg[]>([]);
  const [reactions, setReactions] = useState<ReactionItem[]>([]);
  const [notesOn, setNotesOnState] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [roomState, setRoomState] = useState<RoomState>(NO_ROOM);
  const [ask, setAsk] = useState<MediaAsk | null>(null);
  const [recording, setRecordingState] = useState(false);
  const [opt, setOpt] = useState<{ mic?: boolean; cam?: boolean }>({});
  const [layoutPush, setLayoutPush] = useState<{ mode: string; from: string; ts: number } | null>(null);
  const [question, setQuestions] = useState<Question[]>([]);
  const [waitingToast, setWaitingToast] = useState<string | null>(null);

  const bump = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setTick((t) => t + 1);
    }, 60);
  }, []);

  const send = useCallback((topic: string, obj: unknown, to?: string[]) => {
    const r = roomRef.current;
    if (!r) return;
    r.localParticipant
      .publishData(enc.encode(JSON.stringify(obj)), { reliable: true, topic, ...(to ? { destinationIdentities: to } : {}) })
      .catch(() => {});
  }, []);

  const join = useCallback(
    async (params: JoinParams) => {
      if (roomRef.current) return;
      leavingRef.current = false;
      tokenRef.current = params.token;
      setPhase('connecting');
      setMediaNote(null);
      wantRef.current = { mic: params.micOn, cam: params.camOn };
      wasWaitingRef.current = false;
      kickedRef.current = false;

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        stopLocalTrackOnUnpublish: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          deviceId: params.micId || undefined,
        },
        videoCaptureDefaults: {
          resolution: VideoPresets.h720.resolution,
          facingMode: 'user',
          deviceId: params.camId || undefined,
        },
        publishDefaults: { simulcast: true, dtx: true, red: true },
      });
      roomRef.current = room;

      const sync = () => bump();
      const events = [
        RoomEvent.ParticipantConnected,
        RoomEvent.ParticipantDisconnected,
        RoomEvent.TrackSubscribed,
        RoomEvent.TrackUnsubscribed,
        RoomEvent.TrackMuted,
        RoomEvent.TrackUnmuted,
        RoomEvent.LocalTrackPublished,
        RoomEvent.LocalTrackUnpublished,
        RoomEvent.ActiveSpeakersChanged,
        RoomEvent.ParticipantAttributesChanged,
        RoomEvent.ParticipantMetadataChanged,
        RoomEvent.TrackPublished,
        RoomEvent.TrackUnpublished,
        RoomEvent.ParticipantPermissionsChanged,
      ];
      events.forEach((ev) => (room as unknown as { on: (e: unknown, f: () => void) => void }).on(ev, sync));

      const readRoom = () => setRoomState(room.metadata ? { ...NO_ROOM, ...parseRoomMeta(room.metadata) } as RoomState : NO_ROOM);
      room.on(RoomEvent.RoomMetadataChanged, readRoom);
      room.on(RoomEvent.Reconnecting, () => setReconnecting(true));
      room.on(RoomEvent.Reconnected, () => {
        setReconnecting(false);
        bump();
      });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!room.canPlaybackAudio));
      room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        roomRef.current = null;
        setReconnecting(false);
        setEndReason(
          leavingRef.current
            ? 'left'
            : kickedRef.current || reason === DisconnectReason.PARTICIPANT_REMOVED
              ? 'removed'
              : reason === DisconnectReason.ROOM_DELETED
                ? 'ended'
                : 'error',
        );
        setPhase('ended');
      });
      room.on(RoomEvent.MediaDevicesError, () => setMediaNote('Could not access your camera or microphone. Check browser permissions.'));

      room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (!participant) return;
        let m: Record<string, unknown>;
        try {
          m = JSON.parse(dec.decode(payload));
        } catch {
          return;
        }
        const info = snap(participant);
        if (topic === 'chat') {
          const text = String(m.text || '').slice(0, 2000);
          if (!text) return;
          setChat((c) => [...c.slice(-300), { id: String(m.id || uid()), identity: info.identity, from: info.name, text, ts: Date.now(), mine: false }]);
        } else if (topic === 'react') {
          const emoji = String(m.emoji || '').slice(0, 8);
          if (!emoji) return;
          const r: ReactionItem = { id: uid(), emoji, x: 12 + Math.random() * 76 };
          setReactions((l) => [...l.slice(-30), r]);
          setTimeout(() => setReactions((l) => l.filter((x) => x.id !== r.id)), 3200);
        } else if (topic === 'tx') {
          const text = String(m.text || '').slice(0, 800);
          if (!text) return;
          setTx((l) => [...l.slice(-1500), { id: String(m.id || uid()), identity: info.identity, speaker: info.name, text, ts: Number(m.ts) || Date.now() }]);
        } else if (topic === 'notes') {
          if (info.isHost || info.perms.includes('notes')) setNotesOnState(Boolean(m.on));
        } else if (topic === 'layout') {
          if ((info.isHost || info.perms.includes('interview')) && ['star', 'grid', 'speaker'].includes(String(m.mode))) setLayoutPush({ mode: String(m.mode), from: info.name, ts: Date.now() });
        } else if (topic === 'q') {
          // Interview questions: only a host (or someone with the interview permission) can send them, and only to chosen people.
          if (info.isHost || info.perms.includes('interview')) {
            if (m.op === 'clear') setQuestions((l) => l.filter((x) => x.id !== String(m.id)));
            else if (m.op === 'push') {
              const text = String(m.text || '').slice(0, 600);
              if (text) setQuestions((l) => [...l.filter((x) => x.id !== String(m.id)), { id: String(m.id || uid()), text, secs: Math.max(0, Math.min(3600, Number(m.secs) || 0)), at: Date.now(), from: info.name }]);
            }
          }
        } else if (topic === 'rec') {
          if (info.isHost || info.perms.includes('record')) setRecordingState(Boolean(m.on));
        } else if (topic === 'kick') {
          // Instant removal: the sender must be a host or someone with the remove permission (read from the server-set metadata).
          if (info.isHost || info.perms.includes('kick')) {
            kickedRef.current = true;
            room.disconnect();
          }
        } else if (topic === 'ask') {
          if ((info.isHost || info.perms.includes('mute')) && (m.kind === 'mic' || m.kind === 'cam')) {
            setAsk({ kind: m.kind, from: info.name, id: uid() });
          }
        }
      });

      try {
        await room.connect(params.url, params.token);
        readRoom();
        wasWaitingRef.current = parseMeta(room.localParticipant.metadata).status === 'waiting';
      } catch {
        roomRef.current = null;
        setEndReason('error');
        setPhase('ended');
        return;
      }
      setStartedAt(Date.now());
      try {
        await room.startAudio();
      } catch {
        setAudioBlocked(true);
      }
      setPhase('live');
      if (wasWaitingRef.current) {
        bump();
        return;
      }
      if (params.micOn) {
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch {
          setMediaNote('Microphone is blocked. Allow it in your browser to speak.');
        }
      }
      if (params.camOn) {
        try {
          await room.localParticipant.setCameraEnabled(true);
        } catch {
          setMediaNote('Camera is blocked. Allow it in your browser to share video.');
        }
      }
      bump();
    },
    [bump],
  );

  const reset = useCallback(() => {
    setPhase('idle');
    setEndReason(null);
    setChat([]);
    setTx([]);
    setReactions([]);
    setNotesOnState(false);
    setRecordingState(false);
    setAudioBlocked(false);
    setMediaNote(null);
    setRoomState(NO_ROOM);
    setAsk(null);
  }, []);

  const leave = useCallback(() => {
    leavingRef.current = true;
    const r = roomRef.current;
    if (r) r.disconnect();
    else setPhase('ended');
  }, []);

  useEffect(
    () => () => {
      leavingRef.current = true;
      roomRef.current?.disconnect();
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const toggleMic = useCallback(async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    if (parseMeta(lp.metadata).status === 'waiting') {
      wantRef.current.mic = !wantRef.current.mic;
      return;
    }
    const want = !lp.isMicrophoneEnabled;
    setOpt((o) => ({ ...o, mic: want }));
    try {
      await lp.setMicrophoneEnabled(want);
    } catch {
      setMediaNote('Microphone is blocked. Allow it in your browser to speak.');
    }
    setOpt((o) => ({ ...o, mic: undefined }));
    bump();
  }, [bump]);

  const toggleCam = useCallback(async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    if (parseMeta(lp.metadata).status === 'waiting') {
      wantRef.current.cam = !wantRef.current.cam;
      return;
    }
    const want = !lp.isCameraEnabled;
    setOpt((o) => ({ ...o, cam: want }));
    try {
      await lp.setCameraEnabled(want);
    } catch {
      setMediaNote('Camera is blocked. Allow it in your browser to share video.');
    }
    setOpt((o) => ({ ...o, cam: undefined }));
    bump();
  }, [bump]);

  const toggleScreen = useCallback(async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    try {
      await lp.setScreenShareEnabled(!lp.isScreenShareEnabled, { audio: true, contentHint: 'detail' });
    } catch {
      /* user cancelled the picker */
    }
    bump();
  }, [bump]);

  const toggleHand = useCallback(async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    const next = lp.attributes?.hand === '1' ? '0' : '1';
    try {
      await lp.setAttributes({ hand: next });
    } catch {
      setMediaNote('Could not raise your hand. Check your connection and try again.');
    }
    bump();
  }, [bump]);

  const sendChat = useCallback(
    (text: string) => {
      const r = roomRef.current;
      const t = text.trim().slice(0, 2000);
      if (!r || !t) return;
      const id = uid();
      send('chat', { id, text: t });
      setChat((c) => [...c.slice(-300), { id, identity: r.localParticipant.identity, from: r.localParticipant.name || 'You', text: t, ts: Date.now(), mine: true }]);
    },
    [send],
  );

  const sendReaction = useCallback(
    (emoji: string) => {
      send('react', { emoji });
      const r: ReactionItem = { id: uid(), emoji, x: 12 + Math.random() * 76 };
      setReactions((l) => [...l.slice(-30), r]);
      setTimeout(() => setReactions((l) => l.filter((x) => x.id !== r.id)), 3200);
    },
    [send],
  );

  /** Called with this person's own finished sentences when AI notes are on. */
  const addOwnTranscript = useCallback(
    (text: string) => {
      const r = roomRef.current;
      const t = text.trim().slice(0, 800);
      if (!r || !t) return;
      const id = uid();
      const ts = Date.now();
      send('tx', { id, text: t, ts });
      setTx((l) => [...l.slice(-1500), { id, identity: r.localParticipant.identity, speaker: r.localParticipant.name || 'You', text: t, ts }]);
    },
    [send],
  );

  const setRecording = useCallback(
    (on: boolean) => {
      setRecordingState(on);
      send('rec', { on });
    },
    [send],
  );

  const getMicTrack = useCallback(() => roomRef.current?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack ?? null, []);

  /** Adds a line to the host's own transcript so the AI knows which question was asked to whom. */
  const addQuestionNote = useCallback((text: string, names: string) => {
    const r = roomRef.current;
    if (!r) return;
    const host = r.localParticipant.name || 'Interviewer';
    setTx((l) => [...l.slice(-1500), { id: uid(), identity: r.localParticipant.identity, speaker: `${host} (question to ${names})`, text: text.slice(0, 600), ts: Date.now() }]);
  }, []);

  const setNotes = useCallback(
    (on: boolean) => {
      setNotesOnState(on);
      send('notes', { on });
    },
    [send],
  );

  const switchDevice = useCallback(async (kind: MediaDeviceKind, id: string) => {
    const r = roomRef.current;
    if (!r) return;
    try {
      await r.switchActiveDevice(kind, id);
    } catch {
      setMediaNote('Could not switch that device.');
    }
  }, []);

  const hostAction = useCallback(
    async (action: string, target?: string, extra?: Record<string, unknown>) => {
      // Removal is instant: tell the person directly first, then let the server make it permanent.
      if (action === 'remove' && target) send('kick', { t: Date.now() }, [target]);
      try {
        const res = await fetch('/api/host', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
          body: JSON.stringify({ action, target, ...extra }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [send],
  );

  /** Ask someone to turn their mic or camera on. They get a prompt and decide. */
  const askMedia = useCallback(
    (target: string, kind: 'mic' | 'cam') => send('ask', { kind }, [target]),
    [send],
  );

  const answerAsk = useCallback(
    async (accept: boolean) => {
      const a = ask;
      setAsk(null);
      if (!accept || !a) return;
      const lp = roomRef.current?.localParticipant;
      try {
        if (a.kind === 'mic') await lp?.setMicrophoneEnabled(true);
        else await lp?.setCameraEnabled(true);
      } catch {
        setMediaNote('That device is blocked. Allow it in your browser.');
      }
      bump();
    },
    [ask, bump],
  );

  const participants = useMemo<PInfo[]>(() => {
    const r = roomRef.current;
    if (!r) return [];
    return [r.localParticipant, ...Array.from(r.remoteParticipants.values())].map((p) => {
      const x = snap(p);
      if (x.isLocal) return { ...x, micOn: opt.mic ?? x.micOn, camOn: opt.cam ?? x.camOn };
      return x;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, phase, opt]);

  const audioTracks = useMemo<AudioTrackRef[]>(() => {
    const r = roomRef.current;
    if (!r) return [];
    const out: AudioTrackRef[] = [];
    r.remoteParticipants.forEach((p) => {
      [Track.Source.Microphone, Track.Source.ScreenShareAudio].forEach((src) => {
        const pub = p.getTrackPublication(src);
        if (pub?.track) out.push({ sid: pub.trackSid, track: pub.track });
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, phase]);

  const me = participants.find((p) => p.isLocal);

  // The moment the host lets this person in, switch on the mic and camera they chose in the lobby.
  const myStatus = me?.status;
  useEffect(() => {
    if (myStatus === 'waiting') wasWaitingRef.current = true;
    if (myStatus === 'in' && wasWaitingRef.current) {
      wasWaitingRef.current = false;
      const lp = roomRef.current?.localParticipant;
      if (!lp) return;
      if (wantRef.current.mic) lp.setMicrophoneEnabled(true).catch(() => {});
      if (wantRef.current.cam) lp.setCameraEnabled(true).catch(() => {});
      setStartedAt(Date.now());
    }
  }, [myStatus]);

  // Only people who are in the meeting appear on stage; waiting people are listed for the host.
  const inRoom = useMemo(() => participants.filter((p) => p.status === 'in' || p.isLocal), [participants]);
  const waiting = useMemo(() => participants.filter((p) => p.status === 'waiting' && !p.isLocal), [participants]);
  const waitingAll = useMemo(() => participants.filter((p) => p.status === 'waiting'), [participants]);

  const waitingKey = waiting.map((w) => w.identity).join(',');
  useEffect(() => {
    if (!waiting.length) return setWaitingToast(null);
    const w = waiting[waiting.length - 1];
    setWaitingToast(`${w.name} is waiting to join${w.blocked ? ' (removed earlier)' : ''}`);
    const id = setTimeout(() => setWaitingToast(null), 6000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingKey]);
  const sharingScreen = Boolean(me?.screen);

  return {
    phase,
    endReason,
    mediaNote,
    clearMediaNote: () => setMediaNote(null),
    participants: inRoom,
    waiting,
    waitingAll,
    roomState,
    layoutPush,
    questions: question,
    sendLayout: (mode: string) => send('layout', { mode }),
    pushQuestion: (q: { id: string; text: string; secs: number }, to?: string[]) => send('q', { op: 'push', ...q }, to && to.length ? to : undefined),
    clearQuestion: (id: string, to?: string[]) => send('q', { op: 'clear', id }, to && to.length ? to : undefined),
    dismissQuestion: (id: string) => setQuestions((l) => l.filter((x) => x.id !== id)),
    ask,
    answerAsk,
    askMedia,
    waitingToast,
    audioTracks,
    me,
    isHost: Boolean(me?.isHost),
    perms: me?.perms ?? [],
    can: (perm: string) => Boolean(me?.isHost || me?.perms.includes(perm)),
    isWaiting: me?.status === 'waiting',
    sharingScreen,
    chat,
    tx,
    reactions,
    notesOn,
    addQuestionNote,
    recording,
    setRecording,
    getMicTrack,
    audioBlocked,
    reconnecting,
    startedAt,
    token: tokenRef,
    join,
    leave,
    reset,
    toggleMic,
    toggleCam,
    toggleScreen,
    toggleHand,
    sendChat,
    sendReaction,
    addOwnTranscript,
    setNotes,
    switchDevice,
    hostAction,
    startAudio: async () => {
      try {
        await roomRef.current?.startAudio();
        setAudioBlocked(false);
      } catch {
        /* needs another tap */
      }
    },
  };
}
