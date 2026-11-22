'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Bot,
  Crown,
  Lightbulb,
  Loader2,
  MonitorSmartphone,
  ScrollText,
  Sparkles,
  Star,
  Video,
} from 'lucide-react';
import Starfield from './Starfield';

const CODE_RE = /[a-z]{3}-[a-z]{4}-[a-z]{3}/i;

const FEATURES = [
  { icon: Star, title: 'Star-field view', body: 'The person speaking glides to the centre and everyone else orbits around them. The host wears a crown. Grid and Speaker layouts are one tap away.' },
  { icon: Video, title: 'Clear audio, sharp video', body: 'Noise suppression and echo cancellation on every mic. Video adapts to each viewer, so a weak connection never slows down the room.' },
  { icon: ScrollText, title: 'AI notes for interviews', body: 'A live transcript with the right name on every line, then a summary and a scorecard for each candidate with suggested scores and quotes.' },
  { icon: Lightbulb, title: 'Host Copilot', body: 'Private to the host. Suggests the next question, tracks which topics are covered, and coaches on talk time and pacing.' },
  { icon: Bot, title: 'AI Helper in every meeting', body: 'Anyone can ask about Dense AI or how to use the meeting. It answers from Dense AI material and stays on topic.' },
  { icon: MonitorSmartphone, title: 'Works on every device', body: 'Phones, tablets and laptops. Guests join from a link with no download, and the app can be added to the home screen.' },
];

const STEPS = [
  { n: '1', title: 'Start a meeting', body: 'One tap creates a private room and a link to share.' },
  { n: '2', title: 'Invite people', body: 'Anyone with the link can join from any browser.' },
  { n: '3', title: 'Let AI take the notes', body: 'Turn on AI notes and get a summary when you are done.' },
];

const ORBS = [
  { n: 'Meera', h: 168, x: 50, y: 50, s: 30, host: false, speaking: true },
  { n: 'Aarav', h: 232, x: 14, y: 26, s: 15, host: true, speaking: false },
  { n: 'Sana', h: 290, x: 83, y: 24, s: 14, host: false, speaking: false },
  { n: 'Rohan', h: 12, x: 84, y: 74, s: 13, host: false, speaking: false },
  { n: 'Ishita', h: 330, x: 17, y: 76, s: 13, host: false, speaking: false },
  { n: 'Dev', h: 200, x: 50, y: 10, s: 10, host: false, speaking: false },
  { n: 'Zoya', h: 265, x: 50, y: 91, s: 10, host: false, speaking: false },
];

export default function Landing() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

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
          <span className="logo-mark" />
          <span>Dense Meet</span>
        </a>
        <nav className="nav-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <Sparkles /> Video meetings with built-in AI
            </span>
            <h1>Meetings that listen, think and help.</h1>
            <p>
              Dense Meet is a video meeting platform from Dense AI. Clear calls, a star-field view that follows the conversation, and AI that takes the notes, scores interviews and coaches the host.
            </p>

            <div className="hero-actions">
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

          <div className="hero-art" aria-hidden="true">
            <div className="art-glow" />
            {ORBS.map((o) => (
              <div
                key={o.n}
                className={`art-orb${o.speaking ? ' speaking' : ''}${o.host ? ' host' : ''}`}
                style={{ left: `${o.x}%`, top: `${o.y}%`, width: `${o.s}%`, ['--h' as string]: o.h, animationDelay: `${-o.h % 7}s` } as React.CSSProperties}
              >
                <span>{o.n.slice(0, 2).toUpperCase()}</span>
                {o.host && <Crown fill="currentColor" />}
                <em>{o.n}</em>
              </div>
            ))}
            <svg className="art-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
              <line x1="50" y1="50" x2="14" y2="26" />
              <line x1="50" y1="50" x2="83" y2="24" />
              <line x1="50" y1="50" x2="84" y2="74" />
            </svg>
          </div>
        </section>

        <section id="features" className="section">
          <div className="section-head">
            <span className="eyebrow">What you get</span>
            <h2>Everything a serious meeting needs, and a few things it does not have anywhere else.</h2>
          </div>
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <article key={f.title} className="feature">
                <span className="feature-icon">
                  <f.icon />
                </span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section band">
          <div className="band-copy">
            <span className="eyebrow">Built for interviews and screening</span>
            <h2>Stop typing notes. Start listening.</h2>
            <p>
              Turn on AI notes and everyone&apos;s own speech is transcribed in their browser, so every line carries the right name. When you finish, get a summary and a scorecard for each candidate. Scores are suggestions, and every one points back to what was said.
            </p>
          </div>
          <div className="band-card" aria-label="Example scorecard">
            <div className="band-card-head">
              <span className="avatar" style={{ ['--h' as string]: 330 } as React.CSSProperties}>IS</span>
              <div>
                <strong>Ishita</strong>
                <span>Example scorecard</span>
              </div>
            </div>
            {[
              ['Communication', 4.5],
              ['Attention to detail', 4.0],
              ['Guideline following', 4.5],
              ['Availability', 3.5],
            ].map(([k, v]) => (
              <div className="score-row" key={String(k)}>
                <span>{k}</span>
                <i>
                  <b style={{ width: `${(Number(v) / 5) * 100}%` }} />
                </i>
                <span className="score-num">{Number(v).toFixed(1)}</span>
              </div>
            ))}
            <p className="band-quote">&ldquo;I reread the guidelines first, then spot check a tenth of my own work.&rdquo;</p>
          </div>
        </section>

        <section id="how" className="section">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>From link to notes in three steps.</h2>
          </div>
          <ol className="steps">
            {STEPS.map((s) => (
              <li key={s.n}>
                <span className="step-n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="section cta">
          <h2>Ready when you are.</h2>
          <button className="btn-primary big" type="button" onClick={create} disabled={creating}>
            {creating ? <Loader2 className="spin" /> : <Video />} New meeting
          </button>
        </section>
      </main>

      <footer className="footer">
        <span>Dense Meet</span>
        <span className="muted">A product of Dense AI</span>
      </footer>
    </div>
  );
}
