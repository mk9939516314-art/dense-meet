'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bookmark, Clock, Lightbulb, RefreshCw, Send, Sparkles, Trash2, Users, X } from 'lucide-react';
import { useFacts } from '@/hooks/useAi';
import type { PInfo, TxSeg } from '@/lib/types';
import { cx, uid } from '@/lib/util';
import { Avatar } from './PeoplePanel';

type Props = {
  participants: PInfo[];
  token: { current: string };
  tx: TxSeg[];
  startedAt: number;
  configured: boolean | null;
  notesOn: boolean;
  onToggleNotes: (on: boolean) => void;
  onPush: (q: { id: string; text: string; secs: number }, to?: string[]) => void;
  onClear: (id: string, to?: string[]) => void;
  onNote: (text: string, names: string) => void;
};

type Sent = { id: string; text: string; secs: number; at: number; to: string[]; names: string };

const TIMES = [
  { v: 0, t: 'No limit' },
  { v: 30, t: '30 seconds' },
  { v: 60, t: '1 minute' },
  { v: 120, t: '2 minutes' },
  { v: 180, t: '3 minutes' },
  { v: 300, t: '5 minutes' },
  { v: 600, t: '10 minutes' },
];

function left(s: Sent, now: number) {
  if (!s.secs) return null;
  return Math.max(0, Math.ceil((s.at + s.secs * 1000 - now) / 1000));
}

export default function InterviewPanel(p: Props) {
  const [tab, setTab] = useState<'ask' | 'notes'>('ask');
  const [text, setText] = useState('');
  const [secs, setSecs] = useState(120);
  const [picked, setPicked] = useState<string[]>([]);
  const [sent, setSent] = useState<Sent[]>([]);
  const [bank, setBank] = useState<string[]>([]);
  const [role, setRole] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    try {
      setBank(JSON.parse(localStorage.getItem('dm-qbank') || '[]'));
      setRole(localStorage.getItem('dm-role') || '');
    } catch {
      /* ignore */
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const people = useMemo(() => p.participants.filter((x) => !x.isLocal && !x.isHost), [p.participants]);
  const hosts = useMemo(() => p.participants.filter((x) => x.isHost || x.label).map((x) => x.name), [p.participants]);
  const facts = useFacts(p.token, p.tx, p.startedAt, p.notesOn && p.configured === true, hosts, role);

  const saveBank = (l: string[]) => {
    setBank(l);
    try {
      localStorage.setItem('dm-qbank', JSON.stringify(l.slice(0, 40)));
    } catch {
      /* ignore */
    }
  };

  const toggle = (id: string) => setPicked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  const send = () => {
    const t = text.trim();
    if (!t) return;
    const to = picked.filter((id) => people.some((x) => x.identity === id));
    const names = to.length ? people.filter((x) => to.includes(x.identity)).map((x) => x.name).join(', ') : 'everyone';
    const q = { id: uid(), text: t, secs };
    p.onPush(q, to.length ? to : undefined);
    p.onNote(t, names);
    setSent((l) => [{ ...q, at: Date.now(), to, names }, ...l].slice(0, 30));
    setText('');
  };

  const clear = (s: Sent) => {
    p.onClear(s.id, s.to.length ? s.to : undefined);
    setSent((l) => l.filter((x) => x.id !== s.id));
  };

  return (
    <div className="panel-col">
      <div className="seg tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'ask'} className={cx(tab === 'ask' && 'on')} onClick={() => setTab('ask')}>
          Questions
        </button>
        <button type="button" role="tab" aria-selected={tab === 'notes'} className={cx(tab === 'notes' && 'on')} onClick={() => setTab('notes')}>
          Candidate notes
        </button>
      </div>

      <div className="panel-scroll">
        {tab === 'ask' && (
          <>
            <section className="card">
              <label className="field">
                <span>Question for the screen</span>
                <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a question. It appears on their screen with a timer." maxLength={600} rows={3} />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>Time to answer</span>
                  <select value={secs} onChange={(e) => setSecs(Number(e.target.value))}>
                    {TIMES.map((t) => (
                      <option key={t.v} value={t.v}>
                        {t.t}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="field">
                <span>Send to</span>
                <div className="chips">
                  <button type="button" className={cx('chip-btn', picked.length === 0 && 'on')} onClick={() => setPicked([])}>
                    <Users /> Everyone
                  </button>
                  {people.map((x) => (
                    <button key={x.identity} type="button" className={cx('chip-btn', picked.includes(x.identity) && 'on')} onClick={() => toggle(x.identity)}>
                      <Avatar p={x} /> {x.name}
                    </button>
                  ))}
                </div>
                {people.length === 0 && <span className="muted tiny">Nobody else is in the meeting yet.</span>}
              </div>
              <div className="row-gap">
                <button className="btn-primary" type="button" onClick={send} disabled={!text.trim()}>
                  <Send /> Send question
                </button>
                <button
                  className="btn-ghost"
                  type="button"
                  disabled={!text.trim()}
                  onClick={() => saveBank([text.trim(), ...bank.filter((b) => b !== text.trim())])}
                >
                  <Bookmark /> Save
                </button>
              </div>
            </section>

            {bank.length > 0 && (
              <section className="card">
                <header className="card-head">
                  <h3>
                    <Bookmark /> Saved questions
                  </h3>
                </header>
                <ul className="bank">
                  {bank.map((b) => (
                    <li key={b}>
                      <button type="button" className="bank-q" onClick={() => setText(b)}>
                        {b}
                      </button>
                      <button type="button" className="btn-icon small" aria-label="Delete saved question" onClick={() => saveBank(bank.filter((x) => x !== b))}>
                        <X />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="card">
              <header className="card-head">
                <h3>
                  <Clock /> On their screens
                </h3>
              </header>
              {sent.length === 0 && <p className="muted tiny">Questions you send appear here. Remove one any time and it disappears from their screen.</p>}
              <ul className="sent-list">
                {sent.map((s) => {
                  const l = left(s, now);
                  return (
                    <li key={s.id}>
                      <div>
                        <b>{s.text}</b>
                        <span className="muted tiny">
                          To {s.names} · {l === null ? 'no limit' : l > 0 ? `${Math.floor(l / 60)}:${String(l % 60).padStart(2, '0')} left` : 'time is up'}
                        </span>
                      </div>
                      <button type="button" className="btn-icon small" aria-label="Remove from their screen" title="Remove from their screen" onClick={() => clear(s)}>
                        <Trash2 />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}

        {tab === 'notes' && (
          <>
            {!p.notesOn && (
              <div className="notice warn">
                Notes fill in while AI notes are on.{' '}
                <button className="btn-primary small" type="button" onClick={() => p.onToggleNotes(true)}>
                  <Sparkles /> Turn on AI notes
                </button>
              </div>
            )}
            {p.configured === false && <div className="notice warn">The AI is not connected yet, so candidate notes cannot be written.</div>}
            <label className="field">
              <span>Role you are hiring for (optional, sharpens the questions)</span>
              <input
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  try {
                    localStorage.setItem('dm-role', e.target.value);
                  } catch {
                    /* ignore */
                  }
                }}
                placeholder="e.g. 3D annotation reviewer"
                maxLength={120}
              />
            </label>
            <div className="panel-head-row">
              <span className="muted tiny">{facts.updated ? `Updated ${new Date(facts.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Updates by itself as people talk'}</span>
              <button className="btn-ghost small" type="button" onClick={facts.refresh} disabled={facts.loading || p.configured !== true}>
                <RefreshCw className={facts.loading ? 'spin' : ''} /> Refresh
              </button>
            </div>
            {facts.error && (
              <div className="notice warn">
                {facts.error === 'too_short' ? 'Not enough conversation yet.' : facts.error === 'not_configured' ? 'The AI is not connected yet.' : 'The AI could not update the notes.'}
                {facts.error === 'failed' && facts.detail ? <><br /><span className="tiny muted">{facts.detail}</span></> : null}
              </div>
            )}
            {facts.people.length === 0 && !facts.error && <p className="muted tiny">Everything each candidate says about themselves will be listed here: companies, years, skills, projects and more.</p>}
            {facts.people.map((c) => (
              <section key={c.name} className="card">
                <header className="card-head">
                  <h3>{c.name}</h3>
                  <span className="status-pill on">{c.facts.length} noted</span>
                </header>
                <ul className="facts">
                  {c.facts.map((f, i) => (
                    <li key={i}>
                      <span className={cx('kind', f.kind)}>{f.kind}</span>
                      <span>{f.text}</span>
                      {f.at && <time>{f.at}</time>}
                    </li>
                  ))}
                </ul>
                {c.suggestedQuestions.length > 0 && (
                  <>
                    <h5 className="mini-h">
                      <Lightbulb /> Ask next
                    </h5>
                    <div className="chips col">
                      {c.suggestedQuestions.map((q, i) => (
                        <button
                          key={i}
                          type="button"
                          className="chip-btn"
                          onClick={() => {
                            setText(q);
                            const person = people.find((x) => x.name === c.name);
                            setPicked(person ? [person.identity] : []);
                            setTab('ask');
                          }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
