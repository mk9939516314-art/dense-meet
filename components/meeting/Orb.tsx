'use client';

import type { CSSProperties } from 'react';
import { Hand, MicOff, Pin } from 'lucide-react';
import type { Box } from '@/lib/layout';
import type { PInfo } from '@/lib/types';
import { cx, hashHue, initials } from '@/lib/util';
import { VideoView } from './media';

type Props = {
  p: PInfo;
  box: Box;
  pinned: boolean;
  withVideo: boolean;
  onClick: () => void;
};

export default function Orb({ p, box, pinned, withVideo, onClick }: Props) {
  const hue = p.hue ?? hashHue(p.name);
  const size = Math.min(box.w, box.h);
  const style = {
    transform: `translate3d(${Math.round(box.x)}px, ${Math.round(box.y)}px, 0)`,
    width: Math.round(box.w),
    height: Math.round(box.h),
    '--s': `${Math.round(size)}px`,
    '--h': hue,
    '--lvl': p.speaking ? Math.min(1, p.level * 1.6).toFixed(2) : 0,
  } as CSSProperties;
  const seed = hashHue(p.identity + 'x') + (p.identity.charCodeAt(0) || 0);
  const amp = box.shape === 'tile' ? 0 : Math.max(4, Math.min(16, size * 0.07));
  const floatStyle = {
    animationDelay: `${-(seed % 11)}s`,
    '--dur': `${7 + (seed % 7)}s`,
    '--dx': `${((seed % 2 ? 1 : -1) * amp).toFixed(1)}px`,
    '--dy': `${(((seed >> 1) % 2 ? 1 : -1) * amp * 0.8).toFixed(1)}px`,
  } as CSSProperties;

  const label = `${p.name}${p.isLocal ? ' (you)' : ''}${p.isHost ? ', host' : ''}${p.micOn ? '' : ', muted'}`;
  const showVideo = withVideo && p.camOn && p.cam;

  return (
    <div
      className={cx(
        'orb',
        box.shape === 'tile' ? 'is-tile' : 'is-orb',
        box.small && 'is-small',
        p.isHost && 'is-host',
        p.hand && 'is-hand',
        p.speaking && 'is-speaking',
        !showVideo && 'no-video',
        pinned && 'is-pinned',
      )}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="orb-float" style={floatStyle}>
        <div className="orb-ring" />
        <div className="orb-face">
          {showVideo ? <VideoView track={p.cam!} mirror={p.isLocal} /> : (p.pic ? <img className="orb-pic" src={p.pic} alt="" /> : <span className="orb-initials">{initials(p.name)}</span>)}
        </div>
        {p.isHost && <div className="orb-hostpill">Host</div>}
        <div className="orb-name">
          <span className="orb-name-text">{p.isLocal ? 'You' : p.name}</span>
          {p.isHost && <em>Host</em>}
          {!p.isHost && p.label && <em className="role">{p.label}</em>}
        </div>
        <div className="orb-badges">
          {pinned && (
            <span className="orb-badge" title="Pinned">
              <Pin />
            </span>
          )}
          {p.hand && (
            <span className="orb-badge is-hand" title="Hand raised">
              <Hand />
            </span>
          )}
          {!p.micOn && (
            <span className="orb-badge is-muted" title="Muted">
              <MicOff />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
