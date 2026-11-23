'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, FileText, History as HistoryIcon, Trash2 } from 'lucide-react';
import type { MeetingSummary } from '@/lib/types';
import { readHistory, readNotes, type HistoryItem } from '@/lib/profile';
import Starfield from './Starfield';
import SummaryView, { summaryToMarkdown } from './meeting/panels/SummaryView';

/** Every meeting this device took part in. Running meetings can be rejoined; saved AI notes can be read again. */
export default function HistoryView() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [live, setLive] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const h = readHistory();
    setItems(h);
    if (!h.length) return;
    fetch('/api/rooms/live', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codes: h.slice(0, 10).map((x) => x.code) }) })
      .then((r) => r.json())
      .then((d) => setLive(d.live || {}))
      .catch(() => {});
  }, []);

  const clear = () => {
    try {
      items.forEach((i) => localStorage.removeItem('dm-notes-' + i.code));
      localStorage.removeItem('dm-history');
    } catch {
      /* ignore */
    }
    setItems([]);
  };

  const notes = open ? readNotes(open) : null;
  const summary = notes?.summary as MeetingSummary | undefined;

  const groups = items.reduce<Record<string, HistoryItem[]>>((acc, i) => {
    const d = new Date(i.at).toLocaleDateString([], { dateStyle: 'full' });
    (acc[d] ||= []).push(i);
    return acc;
  }, {});

  return (
    <div className="landing">
      <Starfield />
      <div className="aurora" aria-hidden="true" />
      <div className="history-wrap">
        <div className="lobby-top">
          <Link className="back-link" href="/">
            <ArrowLeft /> Home
          </Link>
          {items.length > 0 && (
            <button className="btn-ghost small" type="button" onClick={clear}>
              <Trash2 /> Clear history
            </button>
          )}
        </div>
        <h1 className="history-h">
          <HistoryIcon /> Meeting history
        </h1>
        <p className="muted">Kept on this device only.</p>

        {items.length === 0 && (
          <div className="empty">
            <strong>No meetings yet</strong>
            <span>Meetings you host or join will show up here.</span>
          </div>
        )}

        {(Object.entries(groups) as [string, HistoryItem[]][]).map(([day, list]) => (
          <section key={day} className="hist-day">
            <h2>{day}</h2>
            <ul className="recent-list one">
              {list.map((h) => {
                const hasNotes = Boolean(readNotes(h.code));
                return (
                  <li key={h.code}>
                    <div>
                      <strong>{h.code}</strong>
                      <span className="muted tiny">
                        {h.host ? 'You hosted' : 'You joined'} · {new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {live[h.code] ? (
                      <span className="chip live">
                        <i className="dot live" /> Live
                      </span>
                    ) : (
                      <span className="chip">Ended</span>
                    )}
                    {hasNotes && (
                      <button className="btn-ghost small" type="button" onClick={() => setOpen(open === h.code ? null : h.code)}>
                        <FileText /> Notes
                      </button>
                    )}
                    <Link className={live[h.code] ? 'btn-primary small' : 'btn-ghost small'} href={'/' + h.code}>
                      {live[h.code] ? 'Rejoin' : h.host ? 'Start again' : 'Open'}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {open && summary && (
          <section className="card hist-notes">
            <header className="card-head">
              <h3>
                <FileText /> Notes for {open}
              </h3>
              <button
                className="btn-ghost small"
                type="button"
                onClick={() => {
                  const blob = new Blob([summaryToMarkdown(summary, `Meeting ${open}`)], { type: 'text/markdown' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `notes-${open}.md`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
                }}
              >
                <Download /> Download
              </button>
            </header>
            <SummaryView s={summary} />
          </section>
        )}
      </div>
    </div>
  );
}
