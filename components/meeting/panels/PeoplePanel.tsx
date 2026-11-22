'use client';

import { useState } from 'react';
import { Crown, Hand, MicOff, Mic, UserX, VolumeX } from 'lucide-react';
import type { PInfo } from '@/lib/types';
import { hashHue, initials } from '@/lib/util';

type Props = {
  participants: PInfo[];
  isHost: boolean;
  onMute: (id: string) => void;
  onMuteAll: () => void;
  onRemove: (id: string) => void;
};

export default function PeoplePanel({ participants, isHost, onMute, onMuteAll, onRemove }: Props) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const sorted = [...participants].sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
    if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="panel-col">
      <div className="panel-scroll">
        <div className="panel-head-row">
          <span className="muted">{participants.length} in this meeting</span>
          {isHost && participants.length > 1 && (
            <button className="btn-ghost small" onClick={onMuteAll} type="button">
              <VolumeX /> Mute all
            </button>
          )}
        </div>
        <ul className="people-list">
          {sorted.map((p) => (
            <li key={p.identity} className="person">
              <span className="avatar" style={{ ['--h' as string]: hashHue(p.name) } as React.CSSProperties}>
                {initials(p.name)}
              </span>
              <span className="person-name">
                {p.name}
                {p.isLocal && <span className="muted"> (You)</span>}
                {p.isHost && (
                  <span className="tag gold">
                    <Crown /> Host
                  </span>
                )}
              </span>
              <span className="person-state">
                {p.hand && <Hand className="gold-text" aria-label="Hand raised" />}
                {p.micOn ? <Mic aria-label="Microphone on" /> : <MicOff className="red-text" aria-label="Muted" />}
              </span>
              {isHost && !p.isLocal && (
                <span className="person-actions">
                  {p.micOn && (
                    <button className="btn-icon small" type="button" onClick={() => onMute(p.identity)} aria-label={`Mute ${p.name}`} title="Mute">
                      <MicOff />
                    </button>
                  )}
                  {confirm === p.identity ? (
                    <button
                      className="btn-danger small"
                      type="button"
                      onClick={() => {
                        onRemove(p.identity);
                        setConfirm(null);
                      }}
                    >
                      Remove?
                    </button>
                  ) : (
                    <button className="btn-icon small" type="button" onClick={() => setConfirm(p.identity)} aria-label={`Remove ${p.name}`} title="Remove from meeting">
                      <UserX />
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
