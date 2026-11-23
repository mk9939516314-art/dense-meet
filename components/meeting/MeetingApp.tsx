'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useMeeting } from '@/hooks/useMeeting';
import { useAiStatus } from '@/hooks/useAi';
import Starfield from '../Starfield';
import { getCid, pushHistory } from '@/lib/profile';
import EndedScreen from './EndedScreen';
import Lobby, { type LobbyResult } from './Lobby';
import Room from './Room';

const ROOM_RE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

export default function MeetingApp({ room }: { room: string }) {
  const code = room.toLowerCase();
  const valid = ROOM_RE.test(code);
  const m = useMeeting();
  const aiConfigured = useAiStatus();
  const [hostProof, setHostProof] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const hp = localStorage.getItem('dm-host-' + code);
      if (hp) setHostProof(hp);
    } catch {
      /* storage unavailable */
    }
  }, [code]);

  const onJoin = useCallback(
    async (r: LobbyResult) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room: code, name: r.name, hostProof, cid: getCid(), hue: r.hue ?? undefined, pic: r.pic || undefined }),
        });
        if (res.status === 503) {
          setError('Meetings are not set up yet. The server is missing its video keys.');
          setBusy(false);
          return;
        }
        if (res.status === 403) {
          setError('The host has locked this meeting. Ask them to unlock it, then try again.');
          setBusy(false);
          return;
        }
        if (!res.ok) {
          setError('Could not join this meeting. Check the link and try again.');
          setBusy(false);
          return;
        }
        const data = (await res.json()) as { token: string; url: string };
        pushHistory({ code, at: Date.now(), host: Boolean(hostProof) });
        await m.join({ token: data.token, url: data.url, micOn: r.micOn, camOn: r.camOn, micId: r.micId, camId: r.camId });
      } catch {
        setError('Network problem. Check your internet and try again.');
      }
      setBusy(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [code, hostProof, m.join],
  );

  if (!valid) {
    return (
      <main className="ended">
        <Starfield />
        <div className="ended-card">
          <h1>This meeting link is not valid</h1>
          <p className="muted">Meeting codes look like abc-defg-hij. Check the link you were sent.</p>
          <Link className="btn-primary" href="/">
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  if (m.phase === 'live') return <Room m={m} roomCode={code} aiConfigured={aiConfigured} />;

  if (m.phase === 'ended' && m.endReason) {
    return (
      <>
        <Starfield />
        <EndedScreen reason={m.endReason} onRejoin={m.reset} />
      </>
    );
  }

  return (
    <>
      <Starfield />
      <Lobby roomCode={code} isHost={Boolean(hostProof)} busy={busy || m.phase === 'connecting'} error={error} onJoin={onJoin} />
    </>
  );
}
