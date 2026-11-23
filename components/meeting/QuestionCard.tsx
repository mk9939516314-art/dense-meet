'use client';

import { useEffect, useState } from 'react';
import { MessageCircleQuestion, X } from 'lucide-react';
import type { Question } from '@/hooks/useMeeting';

/** A question the host put on this person's screen. Shows a countdown and goes away when time is up or the host removes it. */
export default function QuestionCard({ q, onDismiss }: { q: Question; onDismiss: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const total = q.secs * 1000;
  const remain = q.secs ? Math.max(0, q.at + total - now) : 0;
  const pct = q.secs ? (remain / total) * 100 : 100;
  const done = q.secs > 0 && remain === 0;

  useEffect(() => {
    if (!done) return;
    const id = setTimeout(onDismiss, 3000);
    return () => clearTimeout(id);
  }, [done, onDismiss]);

  const s = Math.ceil(remain / 1000);
  return (
    <div className={`qcard${done ? ' done' : ''}`} role="alert">
      <span className="qcard-ic"><MessageCircleQuestion /></span>
      <div className="qcard-body">
        <span className="qcard-from">Question from {q.from}</span>
        <p>{q.text}</p>
        {q.secs > 0 && (
          <div className="qcard-time">
            <i><b style={{ width: `${pct}%` }} /></i>
            <span>{done ? 'Time is up' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</span>
          </div>
        )}
      </div>
      <button className="btn-icon small" type="button" onClick={onDismiss} aria-label="Hide question"><X /></button>
    </div>
  );
}
