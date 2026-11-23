'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Settings,
  BadgeCheck,
  Bot,
  Check,
  History,
  Hourglass,
  Lightbulb,
  Loader2,
  Lock,
  Mic,
  MonitorSmartphone,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Star,
  Video,
  X,
} from 'lucide-react';
import { readHistory, type HistoryItem } from '@/lib/profile';
import SettingsModal from './SettingsModal';
import Starfield from './Starfield';

const CODE_RE = /[a-z]{3}-[a-z]{4}-[a-z]{3}/i;

const FEATURES = [
  { icon: Video, title: 'Clear audio, sharp video', body: 'Echo cancellation and noise suppression on every mic. Video adapts to each viewer, so one weak connection never slows the room.' },
  { icon: Bot, title: 'AI Helper in every meeting', body: 'Anyone can ask about Dense AI or how to use the meeting. It answers from Dense AI material and stays on topic.' },
  { icon: MonitorSmartphone, title: 'Every device', body: 'Phones, tablets and laptops. Guests join from a link with no download, and the app can sit on the home screen.' },
  { icon: Lock, title: 'You stay in control', body: 'Waiting room, meeting lock, instant removal, and a way to let someone back in. Mic and camera requests ask first.' },
  { icon: ScrollText, title: 'Notes without typing', body: 'A live transcript with the right name on every line, kept private to the host and the people the host chooses.' },
  { icon: Star, title: 'Profiles that feel yours', body: 'Pick a photo and a colour. Your star looks like you in every meeting.' },
];

const STEPS = [
  { n: '1', title: 'Start a meeting', body: 'One tap creates a private room and a link to share.' },
  { n: '2', title: 'Let people in', body: 'Use the waiting room or open the door. Lock it any time.' },
  { n: '3', title: 'Get the notes', body: 'Turn on AI notes and read summaries and scorecards when you finish.' },
];

const DEMO = [
  { n: 'Meera', h: 150 },
  { n: 'Aarav', h: 28, host: true },
  { n: 'Sana', h: 330 },
  { n: 'Rohan', h: 12 },
  { n: 'Ishita', h: 275 },
  { n: 'Dev', h: 95 },
  { n: 'Zoya', h: 172 },
];

const ANSWERS = [
  { q: 'What does a pangram test check?', a: 'Said it checks that every letter appears.', v: 'correct', fix: '' },
  { q: 'How do you handle unclear guidelines?', a: 'Would guess and move on.', v: 'incorrect', fix: 'Ask the lead or reread the guideline before deciding.' },
  { q: 'How much of your work do you review?', a: 'Spot checks about a tenth.', v: 'partial', fix: 'A tenth is fine for routine work, but high-risk items need a full check.' },
] as const;

function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!('IntersectionObserver' in window)) {
      els.forEach((e) => e.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.18 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
}

/** A tiny live preview of the real thing: the speaker glides to the centre while everyone keeps drifting. */
function Demo() {
  const [sp, setSp] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSp((v) => (v + 1) % DEMO.length), 2600);
    return () => clearInterval(id);
  }, []);
  const others = DEMO.map((_, i) => i).filter((i) => i !== sp);
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="art-glow" />
      {DEMO.map((o, i) => {
        const isC = i === sp;
        const k = others.indexOf(i);
        const a = -Math.PI / 2 + (k * 2 * Math.PI) / others.length + 0.3;
        const x = isC ? 50 : 50 + Math.cos(a) * 38;
        const y = isC ? 50 : 50 + Math.sin(a) * 36;
        const s = isC ? 30 : 15;
        return (
          <div
            key={o.n}
            className={`art-orb${isC ? ' speaking' : ''}${o.host ? ' host' : ''}`}
            style={{ left: `${x}%`, top: `${y}%`, width: `${s}%`, ['--h' as string]: o.h, ['--d' as string]: `${6 + (i % 4)}s`, animationDelay: `${-i * 1.3}s` } as React.CSSProperties}
          >
            <span>{o.n.slice(0, 2).toUpperCase()}</span>
            <em>{o.n}</em>
          </div>
        );
      })}
    </div>
  );
}

export default function Landing() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [settings, setSettings] = useState(false);
  const [live, setLive] = useState<Record<string, boolean>>({});
  useReveal();

  useEffect(() => {
    const h = readHistory().slice(0, 6);
    setHistory(h);
    if (!h.length) return;
    fetch('/api/rooms/live', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codes: h.map((x) => x.code) }) })
      .then((r) => r.json())
      .then((d) => setLive(d.live || {}))
      .catch(() => {});
  }, []);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      if (res.status === 503) throw new Error('setup');
      if (!res.ok) throw new Error('fail');
      const d = (await res.json()) as { room: string; hostProof: string };
      try {
        localStorage.setItem('dm-host-' + d.room, d.hostProof);
      } catch {
        /* storage unavailable */
      }
      router.push('/' + d.room);
    } catch (e) {
      setError((e as Error).message === 'setup' ? 'Meetings are not set up yet. The video keys are missing on the server.' : 'Could not create a meeting. Check your connection and try again.');
      setCreating(false);
    }
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const m = code.match(CODE_RE);
    if (!m) {
      setError('Enter a meeting code like abc-defg-hij, or paste the full link.');
      return;
    }
    router.push('/' + m[0].toLowerCase());
  };

  return (
    <div className="landing">
      <Starfield />
      <div className="aurora" aria-hidden="true" />

      <header className="nav">
        <a className="logo" href="/" aria-label="Dense Meet home">
          <img className="logo-mark" src="/logo.png" alt="" width={32} height={32} />
          <span>Dense Meet</span>
        </a>
        <nav className="nav-links">
          <a href="#view">The view</a>
          <a href="#interviews">Interviews</a>
          <a href="#control">Control</a>
          <a href="#more">More</a>
          <Link href="/history">History</Link>
        </nav>
        <div className="row-gap">
          <Link className="btn-icon" href="/history" aria-label="Meeting history" title="History">
            <History />
          </Link>
          <button className="btn-icon" type="button" onClick={() => setSettings(true)} aria-label="Settings" title="Settings">
            <Settings />
          </button>
          <button className="btn-ghost small" type="button" onClick={create} disabled={creating}>
            {creating ? <Loader2 className="spin" /> : <Video />} New meeting
          </button>
        </div>
      </header>

      <main>
        {/* Screen 1 */}
        <section className="screen-block hero">
          <div className="hero-copy">
            <span className="eyebrow rise" style={{ ['--i' as string]: 0 } as React.CSSProperties}>
              <Sparkles /> Video meetings with built-in AI
            </span>
            <h1 className="rise" style={{ ['--i' as string]: 1 } as React.CSSProperties}>
              Meetings that <span className="grad">listen</span>, think and help.
            </h1>
            <p className="rise" style={{ ['--i' as string]: 2 } as React.CSSProperties}>
              Dense Meet is a video meeting platform from Dense AI. Clear calls, a star-field view that follows the conversation, and AI that takes notes, scores interviews and coaches the host.
            </p>
            <div className="hero-actions rise" style={{ ['--i' as string]: 3 } as React.CSSProperties}>
              <button className="btn-primary big" type="button" onClick={create} disabled={creating}>
                {creating ? <Loader2 className="spin" /> : <Video />} {creating ? 'Creating' : 'New meeting'}
              </button>
              <form className="join-inline" onSubmit={join}>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter a code or link" aria-label="Meeting code or link" autoComplete="off" autoCapitalize="off" spellCheck={false} />
                <button className="btn-ghost" type="submit" disabled={!code.trim()}>
                  Join <ArrowRight />
                </button>
              </form>
            </div>
            {error && <div className="notice warn" role="alert">{error}</div>}
            <p className="hero-foot">No account needed. Guests join from any browser.</p>
          </div>
          <Demo />
          <a className="scroll-hint" href="#view" aria-label="Scroll down">
            <span />
          </a>
        </section>

        {history.length > 0 && (
          <section className="section recent" data-reveal>
            <div className="section-head">
              <span className="eyebrow"><History /> Your recent meetings</span>
            </div>
            <ul className="recent-list">
              {history.map((h) => (
                <li key={h.code}>
                  <div>
                    <strong>{h.code}</strong>
                    <span className="muted tiny">
                      {h.host ? 'You hosted' : 'You joined'} · {new Date(h.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>
                  {live[h.code] ? <span className="chip live"><i className="dot live" /> Live</span> : <span className="chip">Ended</span>}
                  <Link className={live[h.code] ? 'btn-primary small' : 'btn-ghost small'} href={'/' + h.code}>
                    {live[h.code] ? 'Rejoin' : h.host ? 'Start again' : 'Open'}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Screen 2 */}
        <section id="view" className="screen-block split">
          <div className="split-copy" data-reveal>
            <span className="eyebrow"><Star /> The star-field view</span>
            <h2>Whoever speaks glides to the centre.</h2>
            <p>Everyone else keeps floating around them like stars. The host carries a gold HOST tag, so you always know who is running the room. Prefer a grid or a speaker layout? One tap.</p>
            <ul className="ticks">
              <li><Check /> Instant, smooth movement as the conversation moves</li>
              <li><Check /> Host and role badges you can see at a glance</li>
              <li><Check /> Screen sharing with everyone still in view</li>
            </ul>
          </div>
          <div className="split-art" data-reveal>
            <Demo />
          </div>
        </section>

        {/* Screen 3 */}
        <section id="interviews" className="screen-block split flip">
          <div className="split-copy" data-reveal>
            <span className="eyebrow"><ScrollText /> Built for interviews</span>
            <h2>Stop typing notes. Start listening.</h2>
            <p>Turn on AI notes and get a summary for every candidate: their experience, which answers were right, which were wrong and what a correct answer would sound like. Only the host sees it, unless the host shares it.</p>
            <ul className="ticks">
              <li><Check /> Correctness bar for every candidate</li>
              <li><Check /> Suggested scores that point back to what was said</li>
              <li><Check /> Host Copilot suggests the next question</li>
            </ul>
          </div>
          <div className="band-card" data-reveal aria-label="Example candidate summary">
            <div className="band-card-head">
              <span className="avatar" style={{ ['--h' as string]: 330 } as React.CSSProperties}>IS</span>
              <div>
                <strong>Ishita</strong>
                <span>Example summary · 2 years reviewing AI answers</span>
              </div>
              <span className="chip live">67% correct</span>
            </div>
            <div className="accbar" aria-hidden="true"><i style={{ width: '67%' }} /></div>
            <div className="answers">
              {ANSWERS.map((a) => (
                <div key={a.q} className={`answer ${a.v}`}>
                  <div className="q">{a.q}</div>
                  <div className="muted">{a.a}</div>
                  {a.fix && <div className="fix">Correction: {a.fix}</div>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Screen 4 */}
        <section id="control" className="screen-block split">
          <div className="split-copy" data-reveal>
            <span className="eyebrow"><ShieldCheck /> The host decides</span>
            <h2>Give people exactly the powers you want.</h2>
            <p>Create a role like Helper or Co-interviewer and switch on only what they may do. Everyone else never sees those tools. Control the door with a waiting room or a lock, and let a removed person back in if you choose.</p>
            <ul className="ticks">
              <li><Check /> Custom roles with permissions per person</li>
              <li><Check /> Waiting room, lock, instant removal, allow back</li>
              <li><Check /> Mic and camera requests the person can accept or decline</li>
            </ul>
          </div>
          <div className="role-demo" data-reveal aria-hidden="true">
            <div className="role-row"><span className="avatar" style={{ ['--h' as string]: 28 } as React.CSSProperties}>AA</span><b>Aarav</b><span className="tag host-tag">Host</span></div>
            <div className="role-row"><span className="avatar" style={{ ['--h' as string]: 172 } as React.CSSProperties}>ZO</span><b>Zoya</b><span className="tag role"><BadgeCheck /> Helper</span><Mic /></div>
            <div className="role-row"><span className="avatar" style={{ ['--h' as string]: 12 } as React.CSSProperties}>RO</span><b>Rohan</b><span className="tag warn"><Hourglass /> Waiting</span><span className="btn-primary small">Let in</span><X /></div>
            <div className="ask-mini"><Mic /> <span>Aarav asks you to turn on your microphone</span><span className="btn-primary small">Turn on</span></div>
          </div>
        </section>

        {/* Screen 5 */}
        <section id="more" className="screen-block">
          <div className="section-head" data-reveal>
            <span className="eyebrow"><Lightbulb /> And more</span>
            <h2>Everything a serious meeting needs.</h2>
          </div>
          <div className="feature-grid">
            {FEATURES.map((f, i) => (
              <article key={f.title} className="feature" data-reveal style={{ ['--i' as string]: i % 3 } as React.CSSProperties}>
                <span className="feature-icon"><f.icon /></span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Screen 6 */}
        <section id="how" className="screen-block short">
          <div className="section-head" data-reveal>
            <span className="eyebrow">How it works</span>
            <h2>From link to notes in three steps.</h2>
          </div>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.n} data-reveal style={{ ['--i' as string]: i } as React.CSSProperties}>
                <span className="step-n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="section cta" data-reveal>
          <h2>Ready when you are.</h2>
          <button className="btn-primary big" type="button" onClick={create} disabled={creating}>
            {creating ? <Loader2 className="spin" /> : <Video />} New meeting
          </button>
        </section>
      </main>

      {settings && <SettingsModal onClose={() => setSettings(false)} />}
      <footer className="footer">
        <div className="footer-brand">
          <a className="logo" href="/"><img className="logo-mark" src="/logo.png" alt="" width={32} height={32} /> Dense Meet</a>
          <p className="muted">Video meetings with built-in AI, from Dense AI.</p>
        </div>
        <nav aria-label="Footer">
          <b>Product</b>
          <a href="#view">The view</a>
          <a href="#interviews">Interviews</a>
          <a href="#control">Host controls</a>
        </nav>
        <nav aria-label="Company">
          <b>Company</b>
          <a href="https://dense-ai.vercel.app" target="_blank" rel="noreferrer">Dense AI</a>
          <a href="#how">How it works</a>
          <Link href="/history">History</Link>
        </nav>
        <div className="footer-bottom">© {new Date().getFullYear()} Dense AI. All rights reserved.</div>
      </footer>
    </div>
  );
}
