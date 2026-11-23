'use client';

import { useCallback, useEffect, useState } from 'react';
import { Camera, FolderOpen, HardDrive, SlidersHorizontal, User, Video, X } from 'lucide-react';
import { clientId, driveLinked, driveToken, driveUnlink, setClientId } from '@/lib/drive';
import { folderName, folderSupported, forgetFolder, pickFolder } from '@/lib/localfolder';
import { loadPrefs, savePrefs, isMobile, type Prefs } from '@/lib/prefs';
import { HUES, fileToAvatar, loadProfile, saveProfile } from '@/lib/profile';
import { cx, hashHue, initials } from '@/lib/util';

type Tab = 'profile' | 'meetings' | 'recording';

/** Everything a person can set once: profile, meeting defaults and where recordings go. Saved on this device. */
export default function SettingsModal({ onClose: onDone, start = 'profile', inMeeting = false }: { onClose: () => void; start?: Tab; inMeeting?: boolean }) {
  const [tab, setTab] = useState<Tab>(start);
  const [name, setName] = useState('');
  const [hue, setHue] = useState<number | null>(null);
  const [pic, setPic] = useState('');
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs());
  const [linked, setLinked] = useState(false);
  const [gcid, setGcid] = useState('');
  const [leaving, setLeaving] = useState(false);
  const onClose = useCallback(() => {
    setLeaving(true);
    setTimeout(onDone, 170);
  }, [onDone]);
  const [folder, setFolder] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const mobile = typeof window !== 'undefined' && isMobile();

  useEffect(() => {
    const p = loadProfile();
    setName(p.name);
    setHue(p.hue);
    setPic(p.pic);
    setPrefs(loadPrefs());
    setLinked(driveLinked());
    setGcid(clientId());
    folderName().then(setFolder);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const saveProf = (next: { name?: string; hue?: number | null; pic?: string }) => {
    const p = { name: next.name ?? name, hue: next.hue === undefined ? hue : next.hue, pic: next.pic ?? pic };
    saveProfile(p);
  };
  const setP = (patch: Partial<Prefs>) => {
    const n = { ...prefs, ...patch };
    setPrefs(n);
    savePrefs(n);
  };
  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(''), 3000);
  };

  const connect = async () => {
    try {
      await driveToken(true);
      setLinked(true);
      flash('Google Drive linked.');
    } catch (e) {
      flash((e as Error).message || 'Could not link Google Drive.');
    }
  };

  const shownHue = hue ?? hashHue(name || 'guest');

  return (
    <div className={`modal-back${leaving ? ' is-closing' : ''}`} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal settings-modal${leaving ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-label="Settings">
        <header className="modal-head">
          <h2>Settings</h2>
          <button className="btn-icon" type="button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <div className="seg tabs" role="tablist">
          <button type="button" role="tab" className={cx(tab === 'profile' && 'on')} onClick={() => setTab('profile')}>
            <User /> Profile
          </button>
          <button type="button" role="tab" className={cx(tab === 'meetings' && 'on')} onClick={() => setTab('meetings')}>
            <SlidersHorizontal /> Meetings
          </button>
          <button type="button" role="tab" className={cx(tab === 'recording' && 'on')} onClick={() => setTab('recording')}>
            <Video /> Recording
          </button>
        </div>

        {tab === 'profile' && (
          <div className="set-body">
            <div className="profile-row">
              <label className="avatar-pick">
                <span className="avatar xl" style={{ ['--h' as string]: shownHue } as React.CSSProperties}>
                  {pic ? <img src={pic} alt="Your profile picture" /> : initials(name || 'Guest')}
                </span>
                <span className="avatar-cam"><Camera /></span>
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const d = await fileToAvatar(f);
                      setPic(d);
                      saveProf({ pic: d });
                    } catch {
                      flash('That image could not be read.');
                    }
                  }}
                />
              </label>
              <div className="swatches" role="group" aria-label="Profile colour">
                {HUES.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className={cx('swatch', hue === h && 'on')}
                    style={{ ['--h' as string]: h } as React.CSSProperties}
                    onClick={() => {
                      setHue(h);
                      saveProf({ hue: h });
                    }}
                    aria-label={`Colour ${h}`}
                  />
                ))}
                {pic && (
                  <button
                    type="button"
                    className="btn-ghost small"
                    onClick={() => {
                      setPic('');
                      saveProf({ pic: '' });
                    }}
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>
            <label className="field">
              <span>Display name</span>
              <input
                value={name}
                maxLength={40}
                onChange={(e) => {
                  setName(e.target.value);
                  saveProf({ name: e.target.value });
                }}
                placeholder="Your name"
              />
            </label>
            <p className="muted tiny">{inMeeting ? 'Changes apply the next time you join a meeting.' : 'Used the next time you join a meeting.'}</p>
          </div>
        )}

        {tab === 'meetings' && (
          <div className="set-body">
            <label className="switch-row">
              <span>Join with microphone on</span>
              <input type="checkbox" role="switch" checked={prefs.defaultMic} onChange={(e) => setP({ defaultMic: e.target.checked })} />
            </label>
            <label className="switch-row">
              <span>Join with camera on</span>
              <input type="checkbox" role="switch" checked={prefs.defaultCam} onChange={(e) => setP({ defaultCam: e.target.checked })} />
            </label>
            <label className="field">
              <span>My view in meetings</span>
              <select value={prefs.layout} onChange={(e) => setP({ layout: e.target.value as Prefs['layout'] })}>
                <option value="star">Star-field</option>
                <option value="grid">Grid</option>
                <option value="speaker">Speaker</option>
              </select>
            </label>
          </div>
        )}

        {tab === 'recording' && (
          <div className="set-body">
            <div className="card">
              <header className="card-head">
                <h3><HardDrive /> Google Drive</h3>
                <span className={cx('status-pill', linked && 'on')}>{linked ? 'Linked' : 'Not linked'}</span>
              </header>
              <p className="muted tiny">Recordings upload while you record, into Dense Meet Recordings, one folder per day. Works on phones too.</p>
              {clientId() ? (
                linked ? (
                  <button className="btn-ghost small" type="button" onClick={() => { driveUnlink(); setLinked(false); }}>
                    Unlink
                  </button>
                ) : (
                  <button className="btn-primary small" type="button" onClick={connect}>
                    Link Google Drive
                  </button>
                )
              ) : null}
              <label className="field">
                <span>Google client ID {clientId() ? '' : '(needed once, see the setup note)'}</span>
                <input
                  value={gcid}
                  onChange={(e) => {
                    setGcid(e.target.value);
                    setClientId(e.target.value);
                  }}
                  placeholder="1234567890-abc.apps.googleusercontent.com"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </label>
            </div>

            {!mobile && (
              <div className="card">
                <header className="card-head">
                  <h3><FolderOpen /> Folder on this computer</h3>
                  <span className={cx('status-pill', Boolean(folder) && 'on')}>{folder ?? 'Not chosen'}</span>
                </header>
                {folderSupported() ? (
                  <div className="row-gap">
                    <button
                      className="btn-primary small"
                      type="button"
                      onClick={async () => {
                        try {
                          setFolder(await pickFolder());
                          if (prefs.recordTo === 'drive') setP({ recordTo: 'folder' });
                        } catch {
                          /* cancelled */
                        }
                      }}
                    >
                      {folder ? 'Change folder' : 'Choose folder'}
                    </button>
                    {folder && (
                      <button className="btn-ghost small" type="button" onClick={async () => { await forgetFolder(); setFolder(null); }}>
                        Forget
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="muted tiny">This browser cannot save into a folder. Use Chrome or Edge on a computer.</p>
                )}
                <label className="field">
                  <span>Save recordings to</span>
                  <select value={prefs.recordTo} onChange={(e) => setP({ recordTo: e.target.value as Prefs['recordTo'] })}>
                    <option value="drive">Google Drive</option>
                    <option value="folder">This computer</option>
                    <option value="both">Both</option>
                  </select>
                </label>
                <p className="muted tiny">Files are named by time and meeting code and sorted into a folder for each date.</p>
              </div>
            )}
          </div>
        )}
        {msg && <div className="notice">{msg}</div>}
      </div>
    </div>
  );
}
