'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DisconnectReason, Room, RoomEvent, Track, VideoPresets, type Participant } from 'livekit-client';
import type { ChatItem, PInfo, ReactionItem, TxSeg } from '@/lib/types';
import { uid } from '@/lib/util';

export type Phase = 'idle' | 'connecting' | 'live' | 'ended';
export type EndReason = 'left' | 'removed' | 'ended' | 'error';

export type JoinParams = {
  token: string;
  url: string;
  micOn: boolean;
  camOn: boolean;
  micId?: string;
  camId?: string;
};

export type AudioTrackRef = { sid: string; track: Track };

const enc = new TextEncoder();
const dec = new TextDecoder();

function snap(p: Participant): PInfo {
  let role = '';
  try {
    role = p.metadata ? JSON.parse(p.metadata).role : '';
  } catch {
    role = '';
  }
  const cam = p.getTrackPublication(Track.Source.Camera);
  const mic = p.getTrackPublication(Track.Source.Microphone);
  const scr = p.getTrackPublication(Track.Source.ScreenShare);
  return {
    identity: p.identity,
    name: p.name || 'Guest',
    isLocal: p.isLocal,
    isHost: role === 'host',
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

  const bump = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setTick((t) => t + 1);
    }, 60);
  }, []);

  const send = useCallback((topic: string, obj: unknown) => {
    const r = roomRef.current;
    if (!r) return;
    r.localParticipant.publishData(enc.encode(JSON.stringify(obj)), { reliable: true, topic }).catch(() => {});
  }, []);

  const join = useCallback(
    async (params: JoinParams) => {
      if (roomRef.current) return;
      leavingRef.current = false;
      tokenRef.current = params.token;
      setPhase('connecting');
      setMediaNote(null);

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
      ];
      events.forEach((ev) => (room as unknown as { on: (e: unknown, f: () => void) => void }).on(ev, sync));

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
            : reason === DisconnectReason.PARTICIPANT_REMOVED
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
          if (info.isHost) setNotesOnState(Boolean(m.on));
        }
      });

      try {
        await room.connect(params.url, params.token);
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
    setAudioBlocked(false);
    setMediaNote(null);
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
    try {
      await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled);
    } catch {
      setMediaNote('Microphone is blocked. Allow it in your browser to speak.');
    }
    bump();
  }, [bump]);

  const toggleCam = useCallback(async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    try {
      await lp.setCameraEnabled(!lp.isCameraEnabled);
    } catch {
      setMediaNote('Camera is blocked. Allow it in your browser to share video.');
    }
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
    await lp.setAttributes({ hand: lp.attributes?.hand === '1' ? '0' : '1' }).catch(() => {});
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

  const hostAction = useCallback(async (action: 'mute' | 'muteAll' | 'remove' | 'end', target?: string) => {
    try {
      const res = await fetch('/api/host', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
        body: JSON.stringify({ action, target }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const participants = useMemo<PInfo[]>(() => {
    const r = roomRef.current;
    if (!r) return [];
    return [r.localParticipant, ...Array.from(r.remoteParticipants.values())].map(snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, phase]);

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
  const sharingScreen = Boolean(me?.screen);

  return {
    phase,
    endReason,
    mediaNote,
    clearMediaNote: () => setMediaNote(null),
    participants,
    audioTracks,
    me,
    isHost: Boolean(me?.isHost),
    sharingScreen,
    chat,
    tx,
    reactions,
    notesOn,
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
