'use client';

import { useEffect, useState } from 'react';
import { Room } from 'livekit-client';
import { Camera, Check, Mic, Volume2 } from 'lucide-react';

type Dev = { id: string; label: string };
type Kind = 'audioinput' | 'audiooutput' | 'videoinput';

const TITLE: Record<Kind, string> = { audioinput: 'Microphone', audiooutput: 'Speaker', videoinput: 'Camera' };
const ICON: Record<Kind, React.ReactNode> = { audioinput: <Mic />, audiooutput: <Volume2 />, videoinput: <Camera /> };
const key = (k: Kind) => 'dm-dev-' + k;

async function list(kind: Kind): Promise<Dev[]> {
  try {
    const d = await Room.getLocalDevices(kind);
    return d.map((x, i) => ({ id: x.deviceId, label: x.label || `${TITLE[kind]} ${i + 1}` }));
  } catch {
    return [];
  }
}

/** A small floating menu next to the mic or camera button. */
export default function DeviceMenu({ kinds, onSwitch, closing }: { kinds: Kind[]; onSwitch: (kind: MediaDeviceKind, id: string) => void; closing?: boolean }) {
  const [lists, setLists] = useState<Partial<Record<Kind, Dev[]>>>({});
  const [sel, setSel] = useState<Partial<Record<Kind, string>>>({});

  useEffect(() => {
    kinds.forEach((k) => {
      list(k).then((l) => setLists((s) => ({ ...s, [k]: l })));
      try {
        const v = localStorage.getItem(key(k));
        if (v) setSel((s) => ({ ...s, [k]: v }));
      } catch {
        /* ignore */
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`popover device-pop${closing ? ' is-closing' : ''}`} role="menu">
      {kinds.map((k) => {
        const l = lists[k];
        return (
          <div key={k} className="dev-sec">
            <div className="dev-head">
              {ICON[k]} {TITLE[k]}
            </div>
            {l === undefined && <div className="muted tiny dev-note">Looking for devices</div>}
            {l && l.length === 0 && <div className="muted tiny dev-note">{k === 'audiooutput' ? 'Your browser uses the system speaker. Choosing one is not supported here.' : 'No device found. Allow access in your browser.'}</div>}
            {l?.map((d, i) => {
              const active = (sel[k] ?? l[0]?.id) === d.id || (!sel[k] && i === 0);
              return (
                <button
                  key={d.id || i}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  className={`menu-item dev${active ? ' on' : ''}`}
                  onClick={() => {
                    setSel((s) => ({ ...s, [k]: d.id }));
                    try {
                      localStorage.setItem(key(k), d.id);
                    } catch {
                      /* ignore */
                    }
                    onSwitch(k, d.id);
                  }}
                >
                  <span className="dev-label">{d.label}</span>
                  {active && <Check />}
                </button>
              );
            })}
          </div>
        );
      })}
      {kinds.includes('audioinput') && <div className="dev-foot muted tiny">Noise suppression and echo cancellation are always on.</div>}
    </div>
  );
}
