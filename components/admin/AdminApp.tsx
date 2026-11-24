'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BookOpen, Check, Eye, EyeOff, Headset, LayoutDashboard, LifeBuoy, Loader2, LogOut, MessageSquare, Mic, MicOff, Search, Ticket, Users, Video, VideoOff, X } from 'lucide-react';
import Conversation from './Conversation';
import { ago, api, dur, type Room, type Sess, type Tk } from './types';
import { cx } from '@/lib/util';

type Overview = { db: 'redis' | 'memory'; now: number; sessions: Sess[]; tickets: Tk[] };
type Tab = 'overview' | 'support' | 'chats' | 'meetings' | 'tickets' | 'knowledge';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard /> },
  { id: 'support', label: 'Support', icon: <Headset /> },
  { id: 'chats', label: 'Chats', icon: <MessageSquare /> },
  { id: 'meetings', label: 'Meetings', icon: <Video /> },
  { id: 'tickets', label: 'Tickets', icon: <Ticket /> },
  { id: 'knowledge', label: 'Bot brain', icon: <BookOpen /> },
];

export default function AdminApp() {
  const [auth, setAuth] = useState<'loading' | 'out' | 'in'>('loading');
  const [agent, setAgent] = useState('');
  useEffect(() => {
    api<{ ok: boolean; agent: string }>('/api/admin/me').then((r) => {
      setAgent(r.data.agent || '');
      setAuth(r.data.ok ? 'in' : 'out');
    });
  }, []);
  return (
    <div className="ad-root">
      {auth === 'loading' && <div className="ad-center"><Loader2 className="spin" /></div>}
      {auth === 'out' && <Login onDone={(a) => { setAgent(a); setAuth('in'); }} />}
      {auth === 'in' && <Dashboard agent={agent} onOut={() => setAuth('out')} />}
    </div>
  );
}

function Login({ onDone }: { onDone: (agent: string) => void }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr('');
    const r = await api<{ detail?: string }>('/api/admin/login', { user, pass });
    if (!r.ok) {
      setBusy(false);
      setErr(r.data.detail || 'Could not sign in.');
      return;
    }
    const me = await api<{ agent: string }>('/api/admin/me');
    onDone(me.data.agent || '');
  };
  return (
    <div className="ad-center">
      <form className="ad-login" onSubmit={submit}>
        <img src="/logo.png" alt="" width={56} height={56} />
        <h1>Admin</h1>
        <p className="muted">Sign in to the Dense Meet control room.</p>
        <label>
          <span>ID</span>
          <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" autoCapitalize="off" spellCheck={false} autoFocus />
        </label>
        <label>
          <span>Password</span>
          <div className="ad-pass">
            <input value={pass} onChange={(e) => setPass(e.target.value)} type={show ? 'text' : 'password'} autoComplete="current-password" />
            <button type="button" className="btn-icon" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff /> : <Eye />}</button>
          </div>
        </label>
        {err && <div className="chat-err" role="alert">{err}</div>}
        <button className="btn-primary big" type="submit" disabled={busy || !user || !pass}>{busy ? <Loader2 className="spin" /> : null} Sign in</button>
      </form>
    </div>
  );
}

function beep(ctx: AudioContext | null) {
  if (!ctx) return;
  [0, 0.28, 0.56].forEach((d) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + d);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + d + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d + 0.22);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + d);
    o.stop(ctx.currentTime + d + 0.25);
  });
}

function Dashboard({ agent, onOut }: { agent: string; onOut: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [ov, setOv] = useState<Overview | null>(null);
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [roomNow, setRoomNow] = useState(Date.now());
  const [sel, setSel] = useState('');
  const [skew, setSkew] = useState(0);
  const [tick, setTick] = useState(0);
  const [problem, setProblem] = useState('');
  const audio = useRef<AudioContext | null>(null);
  const known = useRef<Set<string>>(new Set());
  const first = useRef(true);

  useEffect(() => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audio.current = new AC();
      audio.current.resume().catch(() => {});
    } catch {
      /* no sound */
    }
    const unlock = () => audio.current?.resume().catch(() => {});
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      audio.current?.close().catch(() => {});
    };
  }, []);

  const load = useCallback(async () => {
    const r = await api<Overview & { error?: string }>('/api/admin/overview');
    if (r.status === 401) {
      onOut();
      return;
    }
    if (!r.ok) {
      setProblem(r.data.error === 'store' ? 'The database did not answer. Retrying…' : 'Connection problem. Retrying…');
      return;
    }
    setProblem('');
    setSkew(r.data.now - Date.now());
    setOv(r.data);
    const fresh = r.data.sessions.filter((s) => s.status === 'requested' && !known.current.has(s.id + s.reqAt));
    r.data.sessions.forEach((s) => s.status === 'requested' && known.current.add(s.id + s.reqAt));
    if (!first.current && fresh.length) beep(audio.current);
    first.current = false;
  }, [onOut]);

  useEffect(() => {
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await load();
      if (!stop) t = setTimeout(loop, document.hidden ? 5000 : 2000);
    };
    void loop();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [load]);

  const loadRooms = useCallback(async () => {
    const r = await api<{ rooms?: Room[]; now?: number; setup?: boolean }>('/api/admin/meetings');
    if (r.ok) {
      setRooms(r.data.rooms || []);
      setRoomNow(r.data.now || Date.now());
    }
  }, []);
  useEffect(() => {
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await loadRooms();
      if (!stop) t = setTimeout(loop, document.hidden ? 12000 : 5000);
    };
    void loop();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [loadRooms]);

  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 500);
    return () => clearInterval(id);
  }, []);
  void tick;

  const sessions = useMemo(() => ov?.sessions || [], [ov]);
  const requests = sessions.filter((s) => s.status === 'requested');
  const live = sessions.filter((s) => s.status === 'live');
  const openTickets = (ov?.tickets || []).filter((t) => t.status === 'open');
  const people = (rooms || []).reduce((n, r) => n + r.count, 0);

  useEffect(() => {
    document.title = requests.length ? `(${requests.length}) Executive requested | Admin` : 'Admin | Dense Meet';
  }, [requests.length]);

  const now = Date.now() + skew;
  const accept = async (s: Sess) => {
    const r = await api<{ detail?: string }>('/api/admin/act', { action: 'accept', sid: s.id });
    await load();
    if (r.ok) {
      setSel(s.id);
      setTab('support');
    } else setProblem(r.data.detail || 'Could not accept.');
  };
  const decline = async (s: Sess) => {
    await api('/api/admin/act', { action: 'decline', sid: s.id });
    await load();
  };
  const logout = async () => {
    await api('/api/admin/logout', {});
    onOut();
  };
  const openTicket = (t: string) => {
    setTab('tickets');
    setSel('');
    setTimeout(() => document.getElementById('tk-' + t)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  };

  return (
    <div className="ad-shell">
      <header className="ad-top">
        <img src="/logo.png" alt="" width={30} height={30} />
        <b>Dense Meet <span>Admin</span></b>
        <span className="grow" />
        <span className={cx('ad-db', ov?.db)} title={ov?.db === 'memory' ? 'Database not connected: chats may be lost between requests. Add Upstash Redis.' : 'Database connected'}>
          <i /> {ov ? (ov.db === 'redis' ? 'Database online' : 'No database') : 'Connecting'}
        </span>
        <span className="ad-me">{agent}</span>
        <button className="btn-icon" type="button" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut /></button>
      </header>

      <nav className="ad-tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={cx(tab === t.id && 'on')} onClick={() => { setTab(t.id); if (t.id !== 'support' && t.id !== 'chats') setSel(''); }}>
            {t.icon}
            <span>{t.label}</span>
            {t.id === 'support' && requests.length > 0 && <em>{requests.length}</em>}
          </button>
        ))}
      </nav>

      <div className="ad-content">
      {problem && <div className="notice warn ad-problem" role="alert">{problem}</div>}
      {ov?.db === 'memory' && (
        <div className="notice warn ad-problem">
          The database is not connected yet, so chats and requests can disappear between server restarts and may not show up here reliably. Add Upstash Redis (free) in Vercel, then redeploy.
        </div>
      )}

      {requests.length > 0 && (
        <div className="ad-alerts" aria-live="assertive">
          {requests.map((s) => {
            const left = Math.max(0, Math.ceil(((s.expAt || 0) - now) / 1000));
            const pct = Math.max(0, Math.min(100, (left / 60) * 100));
            return (
              <div key={s.id + s.reqAt} className="ad-alert">
                <div className="ad-ring" style={{ ['--p' as string]: pct } as React.CSSProperties}><b>{left}</b></div>
                <div className="ad-alert-body">
                  <b>{s.name || 'A visitor'} wants an executive</b>
                  <span>{s.reason || s.last?.text || 'No reason given'}</span>
                </div>
                <div className="ad-alert-act">
                  <button type="button" className="btn-primary small" onClick={() => void accept(s)}><Check /> Accept</button>
                  <button type="button" className="btn-ghost small" onClick={() => void decline(s)}><X /> Decline</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <main className="ad-main">
        {tab === 'overview' && (
          <div className="ad-grid">
            <div className="ad-stats">
              <Stat icon={<Video />} label="Live meetings" value={rooms ? rooms.length : '…'} tone="violet" onClick={() => setTab('meetings')} />
              <Stat icon={<Users />} label="People in meetings" value={rooms ? people : '…'} tone="pink" onClick={() => setTab('meetings')} />
              <Stat icon={<Headset />} label="Waiting for executive" value={requests.length} tone={requests.length ? 'red' : 'grey'} onClick={() => setTab('support')} />
              <Stat icon={<LifeBuoy />} label="Live chats with you" value={live.length} tone="green" onClick={() => setTab('support')} />
              <Stat icon={<MessageSquare />} label="Bot chats (last 80)" value={sessions.filter((s) => s.status === 'bot').length} tone="amber" onClick={() => setTab('chats')} />
              <Stat icon={<Ticket />} label="Open tickets" value={openTickets.length} tone={openTickets.length ? 'amber' : 'grey'} onClick={() => setTab('tickets')} />
            </div>
            <section className="ad-card">
              <h3><Activity /> Latest chatbot activity</h3>
              {sessions.length === 0 && <p className="ad-empty">No one has used the chatbot yet.</p>}
              <ul className="ad-list">
                {sessions.slice(0, 8).map((s) => (
                  <SessRow key={s.id} s={s} now={now} onClick={() => { setSel(s.id); setTab('chats'); }} />
                ))}
              </ul>
            </section>
            <section className="ad-card">
              <h3><Video /> Meetings right now</h3>
              <RoomList rooms={rooms} now={roomNow} onChanged={loadRooms} compact />
            </section>
          </div>
        )}

        {(tab === 'support' || tab === 'chats') && (
          <ChatsView
            key={tab}
            mode={tab}
            sessions={sessions}
            now={now}
            sel={sel}
            setSel={setSel}
            reload={load}
            openTicket={openTicket}
          />
        )}

        {tab === 'meetings' && (
          <section className="ad-card wide">
            <h3><Video /> Ongoing meetings</h3>
            <RoomList rooms={rooms} now={roomNow} onChanged={loadRooms} />
          </section>
        )}

        {tab === 'tickets' && <TicketsView tickets={ov?.tickets || []} onChanged={load} openChat={(sid) => { setSel(sid); setTab('chats'); }} />}
        {tab === 'knowledge' && <Knowledge />}
      </main>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, tone, onClick }: { icon: React.ReactNode; label: string; value: number | string; tone: string; onClick: () => void }) {
  return (
    <button type="button" className={cx('ad-stat', tone)} onClick={onClick}>
      <span className="ic">{icon}</span>
      <b>{value}</b>
      <span>{label}</span>
    </button>
  );
}

function SessRow({ s, now, onClick, active }: { s: Sess; now: number; onClick: () => void; active?: boolean }) {
  return (
    <li>
      <button type="button" className={cx('ad-row', active && 'on', s.status)} onClick={onClick}>
        <span className="ad-av">{(s.name || 'G').slice(0, 1).toUpperCase()}</span>
        <span className="ad-row-body">
          <b>{s.name || 'Guest'} {s.ticket && <em className="ad-tk">{s.ticket}</em>}</b>
          <span>{s.last ? (s.last.role === 'user' ? '' : s.last.role === 'agent' ? 'You: ' : s.last.role === 'bot' ? 'Bot: ' : '') + s.last.text : 'No messages'}</span>
        </span>
        <span className="ad-row-meta">
          <span className={cx('ad-dot', s.status)} />
          <small>{ago(s.upd, now)}</small>
        </span>
      </button>
    </li>
  );
}

function ChatsView({ mode, sessions, now, sel, setSel, reload, openTicket }: { mode: 'support' | 'chats'; sessions: Sess[]; now: number; sel: string; setSel: (s: string) => void; reload: () => Promise<void>; openTicket: (t: string) => void }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState<'all' | 'bot' | 'requested' | 'live'>('all');
  const list = useMemo(() => {
    let l = sessions;
    if (mode === 'support') l = l.filter((s) => s.status === 'requested' || s.status === 'live' || Boolean(s.ticket) || s.missed);
    if (f !== 'all') l = l.filter((s) => s.status === f);
    if (q.trim()) {
      const k = q.trim().toLowerCase();
      l = l.filter((s) => `${s.name} ${s.email} ${s.ticket || ''} ${s.last?.text || ''} ${s.id}`.toLowerCase().includes(k));
    }
    const rank = (s: Sess) => (s.status === 'requested' ? 0 : s.status === 'live' ? 1 : 2);
    return [...l].sort((a, b) => rank(a) - rank(b) || b.upd - a.upd);
  }, [sessions, mode, f, q]);
  const cur = sessions.find((s) => s.id === sel);
  return (
    <div className={cx('ad-split', sel && 'has-sel')}>
      <aside className="ad-side">
        <div className="ad-search">
          <Search />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, token" />
        </div>
        <div className="ad-filters">
          {(['all', 'requested', 'live', 'bot'] as const).map((k) => (
            <button key={k} type="button" className={cx(f === k && 'on')} onClick={() => setF(k)}>{k === 'all' ? 'All' : k === 'requested' ? 'Waiting' : k === 'live' ? 'Live' : 'Bot'}</button>
          ))}
        </div>
        <ul className="ad-list">
          {list.length === 0 && <li className="ad-empty">{mode === 'support' ? 'No support activity yet.' : 'No chats yet.'}</li>}
          {list.map((s) => (
            <SessRow key={s.id} s={s} now={now} active={s.id === sel} onClick={() => setSel(s.id)} />
          ))}
        </ul>
      </aside>
      <div className="ad-pane">
        {sel ? (
          <Conversation sid={sel} summary={cur} onBack={() => setSel('')} onChanged={reload} openTicket={openTicket} />
        ) : (
          <div className="ad-empty-pane">
            <MessageSquare />
            <p>Pick a conversation to read it live, join it, or reply.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RoomList({ rooms, now, onChanged, compact }: { rooms: Room[] | null; now: number; onChanged: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState('');
  if (!rooms) return <p className="ad-empty"><Loader2 className="spin" /> Loading…</p>;
  if (!rooms.length) return <p className="ad-empty">No meeting is running right now.</p>;
  const act = async (action: string, extra: Record<string, string>, ask: string) => {
    if (!window.confirm(ask)) return;
    setBusy(action + (extra.identity || extra.room));
    await api('/api/admin/act', { action, ...extra });
    setBusy('');
    onChanged();
  };
  return (
    <div className="ad-rooms">
      {rooms.map((r) => {
        const host = r.people.find((p) => p.role === 'host');
        return (
          <article key={r.name} className="ad-room">
            <header>
              <b>{r.name}</b>
              <span className="ad-pill">{r.count} {r.count === 1 ? 'person' : 'people'}</span>
              <span className="muted">{r.started ? dur(now - r.started) : ''}</span>
              <span className="grow" />
              {!compact && (
                <button type="button" className="btn-danger small" disabled={busy === 'endMeeting' + r.name} onClick={() => void act('endMeeting', { room: r.name }, `End meeting ${r.name} for everyone?`)}>End meeting</button>
              )}
            </header>
            <p className="muted tiny">{host ? `Host: ${host.name}` : 'No host connected'}</p>
            <ul>
              {r.people.map((p) => (
                <li key={p.identity}>
                  <span className="ad-av sm">{p.name.slice(0, 1).toUpperCase()}</span>
                  <span className="nm">{p.name}</span>
                  {p.role === 'host' && <em className="ad-host">HOST</em>}
                  {p.label && <em className="ad-lab">{p.label}</em>}
                  {p.status === 'waiting' && <em className="ad-lab">Waiting</em>}
                  <span className="grow" />
                  {p.mic ? <Mic /> : <MicOff className="off" />}
                  {p.cam ? <Video /> : <VideoOff className="off" />}
                  {!compact && (
                    <button type="button" className="btn-icon" aria-label={`Remove ${p.name}`} title="Remove from meeting" disabled={busy === 'removePerson' + p.identity} onClick={() => void act('removePerson', { room: r.name, identity: p.identity }, `Remove ${p.name} from the meeting?`)}><X /></button>
                  )}
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

function TicketsView({ tickets, onChanged, openChat }: { tickets: Tk[]; onChanged: () => Promise<void>; openChat: (sid: string) => void }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [f, setF] = useState<'open' | 'closed' | 'all'>('open');
  const list = tickets.filter((t) => f === 'all' || t.status === f);
  const save = async (t: Tk, status?: 'open' | 'closed') => {
    await api('/api/admin/act', { action: 'ticket', token: t.token, ...(status ? { status } : {}), note: notes[t.token] ?? t.note });
    await onChanged();
  };
  return (
    <section className="ad-card wide">
      <h3><Ticket /> Support tickets</h3>
      <div className="ad-filters">
        {(['open', 'closed', 'all'] as const).map((k) => (
          <button key={k} type="button" className={cx(f === k && 'on')} onClick={() => setF(k)}>{k[0].toUpperCase() + k.slice(1)}</button>
        ))}
      </div>
      {list.length === 0 && <p className="ad-empty">No tickets here.</p>}
      <div className="ad-tickets">
        {list.map((t) => (
          <article key={t.token} id={'tk-' + t.token} className={cx('ad-ticket', t.status)}>
            <header>
              <b>{t.token}</b>
              <span className={cx('ad-pill', t.status)}>{t.status}</span>
              {!t.sent && <span className="ad-pill warn" title="The email to the team did not go out, it is only here">not emailed</span>}
              <span className="grow" />
              <small className="muted">{ago(t.at)}</small>
            </header>
            <p className="who">{t.name || 'Unknown'} {t.email && <>· <a href={`mailto:${t.email}?subject=${encodeURIComponent('Re: [' + t.token + '] ' + t.topic)}`}>{t.email}</a></>}</p>
            {t.topic && <p className="topic">{t.topic}</p>}
            <p className="msg">{t.message}</p>
            <textarea rows={2} placeholder="Internal note" value={notes[t.token] ?? t.note} onChange={(e) => setNotes({ ...notes, [t.token]: e.target.value })} />
            <footer>
              {t.sid && <button type="button" className="btn-ghost small" onClick={() => openChat(t.sid)}><MessageSquare /> Open chat</button>}
              <button type="button" className="btn-ghost small" onClick={() => void save(t)}>Save note</button>
              <button type="button" className={t.status === 'open' ? 'btn-primary small' : 'btn-ghost small'} onClick={() => void save(t, t.status === 'open' ? 'closed' : 'open')}>{t.status === 'open' ? 'Mark resolved' : 'Reopen'}</button>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

function Knowledge() {
  const [notes, setNotes] = useState('');
  const [site, setSite] = useState<{ site: string; chars: number; at: number } | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ notes: string; site: { site: string; chars: number; at: number } }>('/api/admin/know').then((r) => {
      if (r.ok) {
        setNotes(r.data.notes);
        setSite(r.data.site);
      }
    });
  }, []);
  const save = async () => {
    setBusy(true);
    await api('/api/admin/act', { action: 'know', notes });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  return (
    <section className="ad-card wide">
      <h3><BookOpen /> What the chatbot knows</h3>
      <p className="muted">The bot already reads the live Dense AI website{site ? ` (${site.site}${site.chars ? `, ${site.chars.toLocaleString()} characters read` : ', could not be read right now'})` : ''} plus the built-in product guide. Anything you write below is treated as the most trusted knowledge and wins over everything else: names, prices, offers, policies, answers to common questions.</p>
      <textarea className="ad-know" rows={14} maxLength={12000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={'Examples:\nCEO: Anikesh Aman.\nSupport hours: 10am to 7pm IST, Monday to Saturday.\nPilot projects take about two weeks to start.'} />
      <div className="ad-know-foot">
        <small className="muted">{notes.length}/12000</small>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>{saved ? <><Check /> Saved</> : busy ? 'Saving…' : 'Save'}</button>
      </div>
    </section>
  );
}
