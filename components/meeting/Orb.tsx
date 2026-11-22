'use client';

import type { CSSProperties } from 'react';
import { Crown, Hand, MicOff, Pin } from 'lucide-react';
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
  const hue = hashHue(p.name);
  const size = Math.min(box.w, box.h);
  const style = {
    transform: `translate3d(${Math.round(box.x)}px, ${Math.round(box.y)}px, 0)`,
    width: Math.round(box.w),
    height: Math.round(box.h),
    '--s': `${Math.round(size)}px`,
    '--h': hue,
    '--lvl': p.speaking ? Math.min(1, p.level * 1.6).toFixed(2) : 0,
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
      <div className="orb-float" style={{ animationDelay: `${-(hue % 9)}s` }}>
        <div className="orb-ring" />
        <div className="orb-face">
          {showVideo ? <VideoView track={p.cam!} mirror={p.isLocal} /> : <span className="orb-initials">{initials(p.name)}</span>}
        </div>
        {p.isHost && (
          <div className="orb-crown" title="Host">
            <Crown fill="currentColor" strokeWidth={1.5} />
          </div>
        )}
        <div className="orb-name">
          <span className="orb-name-text">{p.isLocal ? 'You' : p.name}</span>
          {p.isHost && <em>Host</em>}
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
