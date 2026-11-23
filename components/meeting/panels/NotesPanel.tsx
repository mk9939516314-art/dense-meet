'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, FileText, Lightbulb, RefreshCw, Sparkles, Wand2 } from 'lucide-react';
import { useCopilot, useSummary, type AiError } from '@/hooks/useAi';
import type { PInfo, TxSeg } from '@/lib/types';
import { cx, mmss } from '@/lib/util';
import SummaryView, { summaryToMarkdown } from './SummaryView';

type Props = {
  isHost: boolean;
  notesOn: boolean;
  onToggleNotes: (on: boolean) => void;
  tx: TxSeg[];
  participants: PInfo[];
  startedAt: number;
  token: { current: string };
  configured: boolean | null;
  supported: boolean;
  blocked: boolean;
  myNotes: boolean;
  setMyNotes: (v: boolean) => void;
  lang: string;
  setLang: (v: string) => void;
  interim: string;
  interview?: boolean;
};

const LANGS = [
  { v: 'en-IN', t: 'English (India)' },
  { v: 'hi-IN', t: 'Hindi' },
  { v: 'en-US', t: 'English (US)' },
  { v: 'en-GB', t: 'English (UK)' },
];

const DEFAULT_TOPICS = 'Communication, Attention to detail, Guideline following, Availability';

function errText(e: AiError) {
  if (e === 'too_short') return 'Not enough conversation yet. Keep talking and try again.';
  if (e === 'busy') return 'Too many requests. Wait a few seconds.';
  if (e === 'not_configured') return 'The AI is not connected yet.';
  return 'The AI could not finish. Try again.';
}

export default function NotesPanel(p: Props) {
  const { isHost, notesOn, tx, participants, startedAt, token, configured } = p;
  const [mode, setMode] = useState<'interview' | 'meeting'>(p.interview ? 'interview' : 'meeting');
  useEffect(() => setMode(p.interview ? 'interview' : 'meeting'), [p.interview]);
  const [topicsText, setTopicsText] = useState(DEFAULT_TOPICS);
  const [copied, setCopied] = useState(false);

  const topics = useMemo(
    () =>
      topicsText
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8),
    [topicsText],
  );
  const hosts = useMemo(() => participants.filter((x) => x.isHost).map((x) => x.name), [participants]);

  const copilot = useCopilot(token, tx, startedAt, isHost && notesOn && configured === true, topics, hosts);
  const summary = useSummary(token, tx, startedAt);

  const talk = useMemo(() => {
    const words = new Map<string, number>();
    tx.forEach((s) => words.set(s.speaker, (words.get(s.speaker) || 0) + s.text.split(/\s+/).length));
    const total = Array.from(words.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(words.entries())
      .map(([name, w]) => ({ name, pct: Math.round((w / total) * 100) }))
      .sort((a, b) => b.pct - a.pct);
  }, [tx]);

  const hostTalk = useMemo(() => {
    const hostNames = new Set(hosts);
    const hostWords = tx.filter((s) => hostNames.has(s.speaker)).reduce((a, s) => a + s.text.split(/\s+/).length, 0);
    const all = tx.reduce((a, s) => a + s.text.split(/\s+/).length, 0);
    return all ? Math.round((hostWords / all) * 100) : 0;
  }, [tx, hosts]);

  const copy = async () => {
    if (!summary.result) return;
    try {
      await navigator.clipboard.writeText(summaryToMarkdown(summary.result, 'Meeting notes'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };
  const download = () => {
    if (!summary.result) return;
    const blob = new Blob([summaryToMarkdown(summary.result, 'Meeting notes')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meeting-notes.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="panel-col">
      <div className="panel-scroll">
        {configured === false && (
          <div className="notice warn">
            The AI is not connected yet. Live transcript still works. Summaries and Host Copilot turn on once the AI key is added in the project settings.
          </div>
        )}

        {/* Control card */}
        <section className="card">
          <header className="card-head">
            <h3>
              <Sparkles /> AI notes
            </h3>
            <span className={cx('status-pill', notesOn && 'on')}>{notesOn ? 'On' : 'Off'}</span>
          </header>
          {isHost ? (
            <>
              <p className="muted">When on, each person&apos;s own speech is transcribed in their browser and shared with a name label. Everyone is told AI notes are on.</p>
              <label className="switch-row">
                <span>Turn on AI notes</span>
                <input type="checkbox" role="switch" checked={notesOn} onChange={(e) => p.onToggleNotes(e.target.checked)} />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>Meeting type</span>
                  <select value={mode} onChange={(e) => setMode(e.target.value as 'interview' | 'meeting')}>
                    <option value="interview">Interview or screening</option>
                    <option value="meeting">General meeting</option>
                  </select>
                </label>
                <label className="field">
                  <span>Speech language</span>
                  <select value={p.lang} onChange={(e) => p.setLang(e.target.value)}>
                    {LANGS.map((l) => (
                      <option key={l.v} value={l.v}>
                        {l.t}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Topics or scoring criteria (comma separated)</span>
                <textarea rows={2} value={topicsText} onChange={(e) => setTopicsText(e.target.value)} />
              </label>
            </>
          ) : (
            <>
              <p className="muted">{notesOn ? 'The host turned on AI notes. Your own speech is transcribed in your browser and shown to everyone with your name.' : 'The host has not turned on AI notes.'}</p>
              {notesOn && (
                <>
                  <label className="switch-row">
                    <span>Transcribe my speech</span>
                    <input type="checkbox" role="switch" checked={p.myNotes} onChange={(e) => p.setMyNotes(e.target.checked)} />
                  </label>
                  <label className="field">
                    <span>My speech language</span>
                    <select value={p.lang} onChange={(e) => p.setLang(e.target.value)}>
                      {LANGS.map((l) => (
                        <option key={l.v} value={l.v}>
                          {l.t}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </>
          )}
          {notesOn && !p.supported && <div className="notice warn">This browser cannot transcribe speech. Use Chrome, Edge or Safari for AI notes.</div>}
          {notesOn && p.blocked && <div className="notice warn">Speech recognition was blocked. Allow the microphone and reload to turn it on.</div>}
          {notesOn && p.interim && <div className="interim">{p.interim}</div>}
        </section>

        {/* Host Copilot */}
        {isHost && (
          <section className="card">
            <header className="card-head">
              <h3>
                <Lightbulb /> Host Copilot
              </h3>
              <span className="tag gold">Only you see this</span>
            </header>
            {!notesOn ? (
              <p className="muted">Turn on AI notes to get live follow-up questions, topic coverage and coaching tips.</p>
            ) : (
              <>
                <button className="btn-ghost small" type="button" onClick={copilot.refresh} disabled={copilot.loading || configured !== true}>
                  <RefreshCw className={cx(copilot.loading && 'spin')} /> {copilot.loading ? 'Thinking' : 'Get suggestions now'}
                </button>
                {copilot.error && <div className="notice warn">{errText(copilot.error)}</div>}
                {copilot.result ? (
                  <div className="copilot">
                    {copilot.result.nextQuestions?.length > 0 && (
                      <>
                        <h4>Ask next</h4>
                        <ul className="bullets">
                          {copilot.result.nextQuestions.map((q, i) => (
                            <li key={i}>{q}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {copilot.result.coverage?.length > 0 && (
                      <>
                        <h4>Topics</h4>
                        <ul className="coverage">
                          {copilot.result.coverage.map((c, i) => (
                            <li key={i} className={cx(c.covered && 'done')}>
                              <i>{c.covered && <Check />}</i>
                              {c.topic}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {copilot.result.tips?.length > 0 && (
                      <>
                        <h4>Coaching</h4>
                        <ul className="bullets">
                          {copilot.result.tips.map((q, i) => (
                            <li key={i}>{q}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                ) : (
                  !copilot.loading && <p className="muted">Suggestions appear after a few sentences are spoken, and refresh about every 45 seconds.</p>
                )}
              </>
            )}
          </section>
        )}

        {/* Talk time */}
        {tx.length > 0 && (
          <section className="card">
            <header className="card-head">
              <h3>Talk time</h3>
              {isHost && hosts.length > 0 && <span className="muted tiny">Host {hostTalk}%</span>}
            </header>
            <div className="talk">
              {talk.slice(0, 8).map((t) => (
                <div key={t.name} className="talk-row">
                  <span>{t.name}</span>
                  <i>
                    <b style={{ width: `${t.pct}%` }} />
                  </i>
                  <span className="score-num">{t.pct}%</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Summary */}
        {isHost && (
          <section className="card">
            <header className="card-head">
              <h3>
                <FileText /> Summary and scorecards
              </h3>
            </header>
            <button
              className="btn-primary"
              type="button"
              disabled={summary.loading || configured !== true || tx.length < 3}
              onClick={() => summary.generate(mode, hosts, mode === 'interview' ? topics : [])}
            >
              <Wand2 /> {summary.loading ? 'Writing notes' : summary.result ? 'Regenerate notes' : 'Generate notes'}
            </button>
            {tx.length < 3 && <p className="muted tiny">Needs a few spoken sentences first.</p>}
            {summary.error && <div className="notice warn">{errText(summary.error)}</div>}
            {summary.result && (
              <>
                <div className="row-gap">
                  <button className="btn-ghost small" type="button" onClick={copy}>
                    {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button className="btn-ghost small" type="button" onClick={download}>
                    <Download /> Download .md
                  </button>
                </div>
                <SummaryView s={summary.result} />
              </>
            )}
          </section>
        )}

        {/* Transcript */}
        <section className="card">
          <header className="card-head">
            <h3>Live transcript</h3>
            <span className="muted tiny">{tx.length} lines</span>
          </header>
          {tx.length === 0 ? (
            <p className="muted">{notesOn ? 'Waiting for someone to speak.' : 'Nothing yet.'}</p>
          ) : (
            <ul className="transcript">
              {tx.slice(-60).map((s) => (
                <li key={s.id}>
                  <time>{mmss(s.ts - startedAt)}</time>
                  <b>{s.speaker}</b>
                  <span>{s.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
