'use client';

import { useState } from 'react';
import { BadgeCheck, Camera, Check, Crown, Hand, Lock, Mic, MicOff, Settings2, ShieldCheck, UserCheck, UserX, Video, VideoOff, VolumeX, X } from 'lucide-react';
import { PERMS } from '@/lib/perms';
import type { PInfo, RoomState } from '@/lib/types';
import { cx, hashHue, initials } from '@/lib/util';

type Props = {
  participants: PInfo[];
  waiting: PInfo[];
  roomState: RoomState;
  isHost: boolean;
  can: (perm: string) => boolean;
  onAct: (action: string, target?: string, extra?: Record<string, unknown>) => Promise<boolean>;
  onAsk: (id: string, kind: 'mic' | 'cam') => void;
};

export function Avatar({ p, size }: { p: Pick<PInfo, 'name' | 'hue' | 'pic'>; size?: 'xl' }) {
  return (
    <span className={cx('avatar', size)} style={{ ['--h' as string]: p.hue ?? hashHue(p.name) } as React.CSSProperties}>
      {p.pic ? <img src={p.pic} alt="" /> : initials(p.name)}
    </span>
  );
}

export default function PeoplePanel({ participants, waiting, roomState, isHost, can, onAct, onAsk }: Props) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [roleFor, setRoleFor] = useState<PInfo | null>(null);
  const [label, setLabel] = useState('');
  const [perms, setPerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const sorted = [...participants].sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
    if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const openRole = (p: PInfo) => {
    setRoleFor(p);
    setLabel(p.label || '');
    setPerms(p.perms);
  };
  const saveRole = async () => {
    if (!roleFor) return;
    setSaving(true);
    await onAct('setRole', roleFor.identity, { label, perms });
    setSaving(false);
    setRoleFor(null);
  };
  const clearRole = async () => {
    if (!roleFor) return;
    setSaving(true);
    await onAct('setRole', roleFor.identity, { label: '', perms: [] });
    setSaving(false);
    setRoleFor(null);
  };

  const mayMod = can('mute') || can('kick');

  return (
    <div className="panel-col">
      <div className="panel-scroll">
        {can('admit') && waiting.length > 0 && (
          <section className="card waiting-card">
            <header className="card-head">
              <h3>
                <UserCheck /> Waiting to join
              </h3>
              <span className="count">{waiting.length}</span>
            </header>
            <ul className="people-list">
              {waiting.map((p) => (
                <li key={p.identity} className="person">
                  <Avatar p={p} />
                  <span className="person-name">
                    {p.name}
                    {p.blocked && <span className="tag warn">Removed earlier</span>}
                  </span>
                  <span className="person-actions">
                    <button className="btn-primary small" type="button" onClick={() => onAct('admit', p.identity)}>
                      <Check /> Let in
                    </button>
                    <button className="btn-icon small" type="button" onClick={() => onAct('deny', p.identity)} aria-label={`Decline ${p.name}`} title="Decline">
                      <X />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {isHost && (
          <section className="card">
            <header className="card-head">
              <h3>
                <ShieldCheck /> Meeting controls
              </h3>
            </header>
            <label className="switch-row">
              <span>Waiting room<small className="muted">New people wait until you let them in</small></span>
              <input type="checkbox" role="switch" checked={roomState.wait} onChange={(e) => onAct('roomSet', undefined, { set: { wait: e.target.checked } })} />
            </label>
            <label className="switch-row">
              <span>Lock meeting<small className="muted">Nobody new can join</small></span>
              <input type="checkbox" role="switch" checked={roomState.locked} onChange={(e) => onAct('roomSet', undefined, { set: { locked: e.target.checked } })} />
            </label>
            <label className="switch-row">
              <span>Interview mode<small className="muted">Only you (and people you allow) see it</small></span>
              <input type="checkbox" role="switch" checked={roomState.interview} onChange={(e) => onAct('roomSet', undefined, { set: { interview: e.target.checked } })} />
            </label>
          </section>
        )}

        <div className="panel-head-row">
          <span className="muted">
            {participants.length} in this meeting {roomState.locked && <Lock className="inline-ic" aria-label="Locked" />}
          </span>
          {can('mute') && participants.length > 1 && (
            <button className="btn-ghost small" onClick={() => onAct('muteAll')} type="button">
              <VolumeX /> Mute all
            </button>
          )}
        </div>

        <ul className="people-list">
          {sorted.map((p) => (
            <li key={p.identity} className="person">
              <Avatar p={p} />
              <span className="person-name">
                {p.name}
                {p.isLocal && <span className="muted"> (You)</span>}
                {p.isHost && (
                  <span className="tag gold">
                    <Crown /> Host
                  </span>
                )}
                {!p.isHost && p.label && (
                  <span className="tag role">
                    <BadgeCheck /> {p.label}
                  </span>
                )}
              </span>
              <span className="person-state">
                {p.hand && <Hand className="gold-text" aria-label="Hand raised" />}
                {p.camOn ? <Video aria-label="Camera on" /> : <VideoOff className="muted" aria-label="Camera off" />}
                {p.micOn ? <Mic aria-label="Microphone on" /> : <MicOff className="red-text" aria-label="Muted" />}
              </span>
              {mayMod && !p.isLocal && !p.isHost && (
                <span className="person-actions">
                  {can('mute') && (
                    <button
                      className="btn-icon small"
                      type="button"
                      onClick={() => (p.micOn ? onAct('mute', p.identity, { kind: 'mic' }) : onAsk(p.identity, 'mic'))}
                      aria-label={p.micOn ? `Mute ${p.name}` : `Ask ${p.name} to unmute`}
                      title={p.micOn ? 'Mute' : 'Ask to unmute'}
                    >
                      {p.micOn ? <MicOff /> : <Mic />}
                    </button>
                  )}
                  {can('mute') && (
                    <button
                      className="btn-icon small"
                      type="button"
                      onClick={() => (p.camOn ? onAct('mute', p.identity, { kind: 'cam' }) : onAsk(p.identity, 'cam'))}
                      aria-label={p.camOn ? `Turn off ${p.name}'s camera` : `Ask ${p.name} to turn camera on`}
                      title={p.camOn ? 'Turn camera off' : 'Ask to turn camera on'}
                    >
                      {p.camOn ? <VideoOff /> : <Camera />}
                    </button>
                  )}
                  {isHost && (
                    <button className="btn-icon small" type="button" onClick={() => openRole(p)} aria-label={`Give ${p.name} a role`} title="Role and permissions">
                      <Settings2 />
                    </button>
                  )}
                  {can('kick') &&
                    (confirm === p.identity ? (
                      <button
                        className="btn-danger small"
                        type="button"
                        onClick={() => {
                          onAct('remove', p.identity);
                          setConfirm(null);
                        }}
                      >
                        Remove?
                      </button>
                    ) : (
                      <button className="btn-icon small" type="button" onClick={() => setConfirm(p.identity)} aria-label={`Remove ${p.name}`} title="Remove from meeting">
                        <UserX />
                      </button>
                    ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {roleFor && (
        <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && setRoleFor(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={`Role for ${roleFor.name}`}>
            <div className="modal-head">
              <h2>Role for {roleFor.name}</h2>
              <button className="btn-icon" type="button" onClick={() => setRoleFor(null)} aria-label="Close">
                <X />
              </button>
            </div>
            <label className="field">
              <span>Role name (shown to everyone)</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Helper, Co-interviewer, Scribe" maxLength={24} />
            </label>
            <div className="perm-list">
              {PERMS.map((x) => (
                <label key={x.id} className="switch-row">
                  <span>{x.label}</span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={perms.includes(x.id)}
                    onChange={(e) => setPerms((l) => (e.target.checked ? [...l, x.id] : l.filter((y) => y !== x.id)))}
                  />
                </label>
              ))}
            </div>
            <p className="muted tiny">Only the permissions you switch on are given. You can change or remove this any time.</p>
            <div className="row-gap end">
              {(roleFor.label || roleFor.perms.length > 0) && (
                <button className="btn-ghost" type="button" onClick={clearRole} disabled={saving}>
                  Remove role
                </button>
              )}
              <button className="btn-primary" type="button" onClick={saveRole} disabled={saving}>
                Save role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
