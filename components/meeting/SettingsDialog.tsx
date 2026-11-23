'use client';

import { useEffect, useState } from 'react';
import { Room } from 'livekit-client';
import { HardDrive, X } from 'lucide-react';
import { clientId, driveLinked, driveToken, driveUnlink } from '@/lib/drive';

type Dev = { id: string; label: string };

async function list(kind: MediaDeviceKind): Promise<Dev[]> {
  try {
    const d = await Room.getLocalDevices(kind);
    return d.map((x, i) => ({ id: x.deviceId, label: x.label || `${kind === 'audioinput' ? 'Microphone' : kind === 'videoinput' ? 'Camera' : 'Speaker'} ${i + 1}` }));
  } catch {
    return [];
  }
}

export default function SettingsDialog({ onClose, onSwitch, canRecord }: { onClose: () => void; onSwitch: (kind: MediaDeviceKind, id: string) => void; canRecord?: boolean }) {
  const [linked, setLinked] = useState(false);
  const [driveErr, setDriveErr] = useState('');
  useEffect(() => setLinked(driveLinked()), []);
  const connect = async () => {
    setDriveErr('');
    try {
      await driveToken(true);
      setLinked(true);
    } catch (e) {
      setDriveErr((e as Error).message);
    }
  };
  const [mics, setMics] = useState<Dev[]>([]);
  const [cams, setCams] = useState<Dev[]>([]);
  const [spk, setSpk] = useState<Dev[]>([]);

  useEffect(() => {
    list('audioinput').then(setMics);
    list('videoinput').then(setCams);
    list('audiooutput').then(setSpk);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const renderSelect = (label: string, items: Dev[], kind: MediaDeviceKind) => (
    <label className="field">
      <span>{label}</span>
      <select onChange={(e) => onSwitch(kind, e.target.value)} defaultValue="" disabled={items.length === 0}>
        <option value="" disabled>
          {items.length ? 'Choose a device' : 'Not available on this device'}
        </option>
        {items.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Audio and video settings">
        <header className="modal-head">
          <h2>Audio and video</h2>
          <button className="btn-icon" type="button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        {renderSelect('Microphone', mics, 'audioinput')}
        {renderSelect('Camera', cams, 'videoinput')}
        {renderSelect('Speaker', spk, 'audiooutput')}
        {canRecord && (
          <div className="card">
            <header className="card-head">
              <h3><HardDrive /> Recording storage</h3>
              <span className={linked ? 'status-pill on' : 'status-pill'}>{linked ? 'Google Drive' : 'This device'}</span>
            </header>
            {clientId() ? (
              linked ? (
                <>
                  <p className="muted tiny">Recordings upload to a folder named Dense Meet Recordings in your Google Drive while you record.</p>
                  <button className="btn-ghost small" type="button" onClick={() => { driveUnlink(); setLinked(false); }}>Use this device instead</button>
                </>
              ) : (
                <>
                  <p className="muted tiny">Link your Google Drive and every recording goes there by default.</p>
                  <button className="btn-primary small" type="button" onClick={connect}>Link Google Drive</button>
                </>
              )
            ) : (
              <p className="muted tiny">Google Drive is not set up on this site yet. Recordings download to this device.</p>
            )}
            {driveErr && <div className="notice warn">{driveErr}</div>}
          </div>
        )}
        <p className="muted tiny">Noise suppression, echo cancellation and automatic volume are always on. Speaker choice is not supported on iPhone and iPad.</p>
      </div>
    </div>
  );
}
