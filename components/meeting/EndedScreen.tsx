'use client';

import Link from 'next/link';
import { CircleAlert, DoorOpen, UserX } from 'lucide-react';
import type { EndReason } from '@/hooks/useMeeting';

const COPY: Record<EndReason, { title: string; body: string; icon: React.ReactNode }> = {
  left: { title: 'You left the meeting', body: 'You can rejoin any time while the meeting is open.', icon: <DoorOpen /> },
  ended: { title: 'The host ended the meeting', body: 'Thanks for joining. Start a new meeting whenever you need one.', icon: <DoorOpen /> },
  removed: { title: 'You were removed', body: 'The host removed you from this meeting. You can ask to come back and the host will decide.', icon: <UserX /> },
  error: { title: 'Connection lost', body: 'We could not stay connected. Check your internet and try rejoining.', icon: <CircleAlert /> },
  locked: { title: 'Meeting is locked', body: 'The host locked this meeting.', icon: <UserX /> },
};

export default function EndedScreen({ reason, onRejoin }: { reason: EndReason; onRejoin: () => void }) {
  const c = COPY[reason];
  return (
    <main className="ended">
      <div className="ended-card">
        <span className="ended-icon">{c.icon}</span>
        <h1>{c.title}</h1>
        <p className="muted">{c.body}</p>
        <div className="row-gap center">
          {reason !== 'ended' && (
            <button className="btn-primary" type="button" onClick={onRejoin}>
              {reason === 'removed' ? 'Ask to rejoin' : 'Rejoin'}
            </button>
          )}
          <Link className="btn-ghost" href="/">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
