'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MonitorUp } from 'lucide-react';
import { computeLayout } from '@/lib/layout';
import type { LayoutMode, PInfo, ReactionItem } from '@/lib/types';
import { cx } from '@/lib/util';
import Orb from './Orb';
import { VideoView } from './media';

type Props = {
  participants: PInfo[];
  mode: LayoutMode;
  pinned: string | null;
  onPin: (id: string | null) => void;
  reactions: ReactionItem[];
  bottomPad: number;
};

const MAX_VIDEO = 25;

export default function Stage({ participants, mode, pinned, onPin, reactions, bottomPad }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [centerId, setCenterId] = useState('');
  const lastSpoke = useRef<Map<string, number>>(new Map());
  const centerSince = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Who sits in the middle: pinned person, otherwise the most recent loud speaker (with a short hold so it never flickers).
  useEffect(() => {
    const now = Date.now();
    participants.forEach((p) => {
      if (p.speaking) lastSpoke.current.set(p.identity, now);
    });
    const ids = new Set(participants.map((p) => p.identity));
    let next = centerId;
    if (pinned && ids.has(pinned)) {
      next = pinned;
    } else {
      const top = participants.filter((p) => p.speaking).sort((a, b) => b.level - a.level)[0];
      if (top && top.identity !== centerId && now - centerSince.current > 650) next = top.identity;
      if (!next || !ids.has(next)) {
        const fallback = participants.find((p) => !p.isLocal) || participants[0];
        next = fallback ? fallback.identity : '';
      }
    }
    if (next !== centerId) {
      setCenterId(next);
      centerSince.current = now;
    }
  }, [participants, pinned, centerId]);

  const presenter = participants.find((p) => p.screen);
  const effectiveMode = presenter ? 'present' : mode;

  const { ordered, others, byId } = useMemo(() => {
    const map = new Map(participants.map((p) => [p.identity, p]));
    const rest = participants
      .filter((p) => p.identity !== centerId)
      .sort((a, b) => {
        if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
        if (a.hand !== b.hand) return a.hand ? -1 : 1;
        const la = lastSpoke.current.get(a.identity) || 0;
        const lb = lastSpoke.current.get(b.identity) || 0;
        if (la !== lb) return lb - la;
        return a.joinedAt - b.joinedAt;
      });
    return { ordered: [centerId, ...rest.map((p) => p.identity)], others: rest.map((p) => p.identity), byId: map };
  }, [participants, centerId]);

  const layout = useMemo(
    () =>
      computeLayout({
        mode: effectiveMode,
        W: size.w,
        H: Math.max(0, size.h - bottomPad),
        center: centerId,
        others,
      }),
    [effectiveMode, size.w, size.h, bottomPad, centerId, others],
  );

  const placed = ordered.filter((id) => layout.boxes[id] && byId.get(id));
  const hidden = participants.length - placed.length;

  // Constellation lines from the speaker to the three most recent speakers.
  const lines = useMemo(() => {
    if (effectiveMode !== 'star') return [];
    const c = layout.boxes[centerId];
    if (!c) return [];
    const recent = others
      .filter((id) => lastSpoke.current.get(id) && layout.boxes[id])
      .sort((a, b) => (lastSpoke.current.get(b) || 0) - (lastSpoke.current.get(a) || 0))
      .slice(0, 3);
    return recent.map((id) => {
      const b = layout.boxes[id];
      const x1 = c.x + c.w / 2;
      const y1 = c.y + c.h / 2;
      const x2 = b.x + b.w / 2;
      const y2 = b.y + b.h / 2;
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      return { id, x1, y1, len, ang };
    });
  }, [effectiveMode, layout, centerId, others]);

  const scr = layout.screen;

  return (
    <div ref={ref} className={cx('stage', `stage-${effectiveMode}`)}>
      {lines.map((l) => (
        <div
          key={l.id}
          className="constellation"
          style={{ left: l.x1, top: l.y1, width: l.len, transform: `rotate(${l.ang}deg)` }}
          aria-hidden="true"
        />
      ))}

      {presenter && scr && (
        <div className="screen" style={{ left: scr.x, top: scr.y, width: scr.w, height: scr.h }}>
          {presenter.isLocal ? (
            <div className="screen-self">
              <MonitorUp />
              <strong>You are presenting</strong>
              <span>Everyone can see your screen.</span>
            </div>
          ) : (
            <VideoView track={presenter.screen!} contain />
          )}
          <div className="screen-label">{presenter.isLocal ? 'Your screen' : `${presenter.name} is presenting`}</div>
        </div>
      )}

      {placed.map((id, i) => {
        const p = byId.get(id)!;
        return (
          <Orb
            key={id}
            p={p}
            box={layout.boxes[id]}
            pinned={pinned === id}
            withVideo={i < MAX_VIDEO}
            onClick={() => onPin(pinned === id ? null : id)}
          />
        );
      })}

      {hidden > 0 && <div className="stage-more">+{hidden} more in People</div>}

      <div className="reactions" aria-hidden="true">
        {reactions.map((r) => (
          <span key={r.id} className="reaction" style={{ left: `${r.x}%` }}>
            {r.emoji}
          </span>
        ))}
      </div>
    </div>
  );
}
