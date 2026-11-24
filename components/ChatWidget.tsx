'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, Check, Copy, Headset, History, LifeBuoy, Mail, MessageCircle, Mic, RotateCcw, Settings, Square, Trash2, Video, X } from 'lucide-react';
import { usePresence } from '@/lib/usePresence';
import { cx, uid } from '@/lib/util';

type Action = { kind: 'new_meeting' | 'join' | 'open' | 'settings'; arg?: string };
type Ticket = { token: string; sent: boolean; to: string; mailto: string };
type Conn = { name: string; email: string; reason: string };
type Live = { status: 'bot' | 'requested' | 'live' | 'closed'; agent: string; expAt: number; skew: number };
type Msg = { id: string; role: 'user' | 'assistant' | 'agent' | 'system'; by?: string; text: string; connect?: Conn; actions?: Action[]; ticket?: Ticket; pending?: { name: string; email: string; topic: string; message: string }; error?: string };

const KEY = 'dm-chat';
const SID = 'dm-chat-sid';
const newSid = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const CHIPS = ['How do I start a meeting?', 'Set up Google Drive recording', 'How does interview mode work?', 'Talk to the Dense AI team'];

/* ---------- tiny, safe Markdown ---------- */
function inline(text: string, k: string) {
  const out: React.ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\((?:https?:\/\/|mailto:|\/)[^)\s]+\))|(https?:\/\/[^\s<)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const key = `${k}-${i++}`;
    if (m[1]) out.push(<code key={key}>{t.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={key}>{t.slice(2, -2)}</strong>);
    else if (m[3]) out.push(<em key={key}>{t.slice(1, -1)}</em>);
    else if (m[4]) {
      const mm = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      out.push(<a key={key} href={mm[2]} target="_blank" rel="noreferrer">{mm[1]}</a>);
    } else out.push(<a key={key} href={t} target="_blank" rel="noreferrer">{t}</a>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Code({ lang, code }: { lang: string; code: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="chat-code">
      <div className="chat-code-bar">
        <span>{lang || 'code'}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(code).then(() => {
              setOk(true);
              setTimeout(() => setOk(false), 1400);
            });
          }}
        >
          {ok ? <Check /> : <Copy />} {ok ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      blocks.push(<Code key={n++} lang={fence[1]} code={buf.join('\n')} />);
      continue;
    }
    if (/^\s*([-*•])\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•])\s+/, ''));
      blocks.push(<ul key={n++}>{items.map((t, j) => <li key={j}>{inline(t, `u${n}-${j}`)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      blocks.push(<ol key={n++}>{items.map((t, j) => <li key={j}>{inline(t, `o${n}-${j}`)}</li>)}</ol>);
      continue;
    }
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h) {
      blocks.push(<p key={n++} className="chat-h">{inline(h[1], `h${n}`)}</p>);
      i++;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^```|^\s*([-*•])\s+|^\s*\d+[.)]\s+|^#{1,4}\s/.test(lines[i])) buf.push(lines[i++]);
    blocks.push(
      <p key={n++}>
        {buf.map((t, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(t, `p${n}-${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <>{blocks}</>;
}

/** Splits the visible text from the control markers the model may append. */
function parse(raw: string, final: boolean) {
  const actions: Action[] = [];
  let ticket: Msg['pending'];
  let connect: Conn | undefined;
  let text = raw.replace(/\[\[connect(?::(\{[\s\S]*?\}))?\]\]/g, (_, j?: string) => {
    connect = { name: '', email: '', reason: '' };
    if (j) {
      try {
        const o = JSON.parse(j) as Record<string, unknown>;
        connect = { name: String(o.name || ''), email: String(o.email || ''), reason: String(o.reason || '') };
      } catch {
        /* keep defaults */
      }
    }
    return '';
  });
  text = text.replace(/\[\[ticket:(\{[\s\S]*?\})\]\]/g, (_, j) => {
    try {
      const o = JSON.parse(j) as Record<string, unknown>;
      ticket = { name: String(o.name || ''), email: String(o.email || ''), topic: String(o.topic || ''), message: String(o.message || '') };
    } catch {
      /* malformed marker */
    }
    return '';
  });
  text = text.replace(/\[\[action:([a-z_]+)(?::([^\]]*))?\]\]/g, (_, k: string, arg?: string) => {
    if (k === 'new_meeting') actions.push({ kind: 'new_meeting' });
    else if (k === 'join' && arg) actions.push({ kind: 'join', arg: arg.trim().toLowerCase() });
    else if (k === 'open' && arg && arg.startsWith('/')) actions.push({ kind: 'open', arg: arg.trim() });
    else if (k === 'settings') actions.push({ kind: 'settings' });
    return '';
  });
  // hide a marker that is still being typed
  const cut = text.lastIndexOf('[[');
  if (cut >= 0 && !text.slice(cut).includes(']]')) text = text.slice(0, cut);
  return { text: final ? text.trim() : text.replace(/^\s+/, ''), actions, ticket, connect };
}

function load(): Msg[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]') as Msg[];
    return Array.isArray(v) ? v.slice(-40).map((m) => ({ ...m, pending: undefined, error: undefined })) : [];
  } catch {
    return [];
  }
}

export default function ChatWidget({ page = 'home' }: { page?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const pres = usePresence(open, 190);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(false);
  const [listening, setListening] = useState(false);
  const [ready, setReady] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const rec = useRef<{ stop: () => void } | null>(null);
  const stick = useRef(true);
  const sid = useRef('');
  const nRef = useRef(-1);
  const [live, setLive] = useState<Live>({ status: 'bot', agent: '', expAt: 0, skew: 0 });
  const [unread, setUnread] = useState(0);
  const [, setNow] = useState(0);
  const hasTicket = msgs.some((m) => m.ticket);

  useEffect(() => {
    try {
      sid.current = localStorage.getItem(SID) || '';
      if (!sid.current) {
        sid.current = newSid();
        localStorage.setItem(SID, sid.current);
      }
    } catch {
      sid.current = newSid();
    }
    setMsgs(load());
    setReady(true);
    const openIt = () => setOpen(true);
    window.addEventListener('dm-chat-open', openIt);
    return () => window.removeEventListener('dm-chat-open', openIt);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(msgs.slice(-40).map(({ pending, error, ...m }) => m)));
    } catch {
      /* storage unavailable */
    }
  }, [msgs, ready]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => area.current?.focus({ preventScroll: true }), 220);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Keep the card above the on-screen keyboard.
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const fit = () => {
      const el = panel.current;
      if (!el) return;
      const covered = Math.max(0, window.innerHeight - (vv.offsetTop + vv.height));
      el.style.setProperty('--kb', `${covered}px`);
      el.style.setProperty('--vvh', `${vv.height}px`);
    };
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
    };
  }, [open, pres.mounted]);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs, form, pres.mounted]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const poll = useCallback(async () => {
    if (!sid.current) return;
    try {
      const res = await fetch(`/api/chat/live?sid=${sid.current}&n=${nRef.current}`, { cache: 'no-store' });
      if (!res.ok) return;
      const j = (await res.json()) as { status: Live['status']; agent: string; expAt: number; now: number; total: number; msgs: { id: string; role: 'agent' | 'system'; text: string; by?: string }[] };
      setLive({ status: j.status, agent: j.agent, expAt: j.expAt, skew: j.now - Date.now() });
      nRef.current = j.total;
      if (j.msgs.length) {
        setMsgs((p) => {
          const seen = new Set(p.map((m) => m.id));
          const add = j.msgs.filter((m) => !seen.has('s' + m.id)).map((m) => ({ id: 's' + m.id, role: m.role, by: m.by, text: m.text }) as Msg);
          return add.length ? [...p, ...add] : p;
        });
        if (!openRef.current) setUnread((v) => v + j.msgs.filter((m) => m.role === 'agent').length || v);
      }
    } catch {
      /* try again next tick */
    }
  }, []);
  const openRef = useRef(false);
  openRef.current = open;

  useEffect(() => {
    if (!ready) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await poll();
      if (stop) return;
      const active = live.status === 'requested' || live.status === 'live';
      const wait = active ? (openRef.current ? 1500 : 4000) : openRef.current ? 8000 : hasTicket ? 15000 : 0;
      if (wait) t = setTimeout(loop, document.hidden ? Math.max(wait, 6000) : wait);
      else t = setTimeout(loop, 20000);
    };
    t = setTimeout(loop, 400);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [ready, poll, live.status, hasTicket, open]);

  useEffect(() => {
    if (live.status !== 'requested') return;
    const id = setInterval(() => setNow((v) => v + 1), 500);
    return () => clearInterval(id);
  }, [live.status]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  const connectAgent = useCallback(
    async (info: Conn) => {
      if (live.status === 'live' || live.status === 'requested') return;
      const name = info.name;
      try {
        const res = await fetch('/api/chat/live', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid: sid.current, action: 'connect', name, email: info.email, reason: info.reason, page }) });
        const j = (await res.json()) as { status?: Live['status']; agent?: string; expAt?: number; now?: number; detail?: string };
        if (!res.ok) throw new Error(j.detail || 'failed');
        setLive({ status: j.status || 'bot', agent: j.agent || '', expAt: j.expAt || 0, skew: (j.now || Date.now()) - Date.now() });
        await poll();
      } catch (e) {
        setMsgs((p) => [...p, { id: uid(), role: 'system', text: e instanceof Error && e.message !== 'failed' ? e.message : 'Could not reach an executive right now. Please try again.' }]);
      }
    },
    [live.status, page, poll],
  );

  const liveAction = useCallback(
    async (action: 'cancel' | 'leave') => {
      try {
        const res = await fetch('/api/chat/live', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid: sid.current, action }) });
        const j = (await res.json()) as { status?: Live['status']; now?: number };
        setLive({ status: j.status || 'bot', agent: '', expAt: 0, skew: (j.now || Date.now()) - Date.now() });
        setMsgs((p) => [...p, { id: uid(), role: 'system', text: action === 'cancel' ? 'Request cancelled. The assistant is back.' : 'You are back with the assistant.' }]);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const patch = useCallback((id: string, f: (m: Msg) => Msg) => setMsgs((p) => p.map((m) => (m.id === id ? f(m) : m))), []);

  const makeTicket = useCallback(
    async (id: string, d: NonNullable<Msg['pending']>) => {
      try {
        const res = await fetch('/api/support', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...d, page, sid: sid.current }) });
        const j = (await res.json()) as Ticket & { error?: string; detail?: string };
        if (!res.ok) throw new Error(j.detail || j.error || 'failed');
        patch(id, (m) => ({ ...m, pending: undefined, ticket: { token: j.token, sent: j.sent, to: j.to, mailto: j.mailto } }));
      } catch (e) {
        patch(id, (m) => ({ ...m, pending: undefined, error: e instanceof Error && e.message !== 'failed' ? e.message : 'Could not create the token right now. Please try again.' }));
      }
    },
    [page, patch],
  );

  const ask = useCallback(
    async (history: Msg[]) => {
      const id = uid();
      stick.current = true;
      setMsgs([...history, { id, role: 'assistant', text: '' }]);
      setBusy(true);
      const c = new AbortController();
      ctl.current = c;
      let raw = '';
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: c.signal,
          body: JSON.stringify({
            sid: sid.current,
            messages: history.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.text })).filter((m) => m.content),
            ctx: { page, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, now: new Date().toLocaleString() },
          }),
        });
        if (!res.ok || !res.body) {
          const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
          if (j.error === 'not_configured') throw new Error('The assistant is not switched on yet. You can still send a message to the team below.');
          throw new Error(j.detail || 'The assistant could not answer right now. Please try again.');
        }
        if ((res.headers.get('content-type') || '').includes('application/json')) {
          // An executive already has this chat, so the assistant stays quiet.
          const j = (await res.json().catch(() => ({}))) as { status?: Live['status'] };
          setMsgs((p) => p.filter((m) => m.id !== id));
          setLive((l) => ({ ...l, status: j.status || 'live' }));
          void poll();
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          raw += dec.decode(value, { stream: true });
          const p = parse(raw, false);
          patch(id, (m) => ({ ...m, text: p.text }));
        }
        const p = parse(raw, true);
        if (!p.text && !p.ticket && !p.actions.length && !p.connect) throw new Error('The assistant sent an empty reply. Please try again.');
        patch(id, (m) => ({ ...m, text: p.text, actions: p.actions.length ? p.actions : undefined, pending: p.ticket }));
        if (p.ticket) void makeTicket(id, p.ticket);
        if (p.connect) void connectAgent(p.connect);
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          const p = parse(raw, true);
          patch(id, (m) => ({ ...m, text: p.text || m.text }));
        } else {
          patch(id, (m) => ({ ...m, error: (e as Error).message || 'The assistant could not answer right now.' }));
        }
      } finally {
        setBusy(false);
        ctl.current = null;
      }
    },
    [connectAgent, makeTicket, page, patch, poll],
  );

  const send = useCallback(
    (t?: string) => {
      const v = (t ?? text).trim();
      if (!v || busy) return;
      setText('');
      if (area.current) area.current.style.height = '';
      if (live.status === 'requested' || live.status === 'live') {
        // Talking to a person: no bot, the message goes straight to the executive.
        stick.current = true;
        setMsgs((p) => [...p, { id: uid(), role: 'user', text: v.slice(0, 2000) }]);
        fetch('/api/chat/live', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid: sid.current, action: 'say', text: v, page }) })
          .then((r) => r.json())
          .then((j: { status?: Live['status'] }) => j.status && setLive((l) => ({ ...l, status: j.status as Live['status'] })))
          .catch(() => setMsgs((p) => [...p, { id: uid(), role: 'system', text: 'That message may not have been delivered. Please send it again.' }]));
        return;
      }
      void ask([...msgs.filter((m) => m.text || m.ticket), { id: uid(), role: 'user', text: v.slice(0, 2000) }]);
    },
    [ask, busy, live.status, msgs, page, text],
  );

  const retry = () => {
    const last = [...msgs].reverse().find((m) => m.role === 'user');
    if (!last || busy) return;
    const upto = msgs.slice(0, msgs.lastIndexOf(last) + 1);
    void ask(upto);
  };

  const clear = () => {
    ctl.current?.abort();
    if (live.status === 'live' || live.status === 'requested') void liveAction(live.status === 'live' ? 'leave' : 'cancel');
    setMsgs([]);
    setForm(false);
    sid.current = newSid();
    nRef.current = -1;
    setLive({ status: 'bot', agent: '', expAt: 0, skew: 0 });
    try {
      localStorage.setItem(SID, sid.current);
    } catch {
      /* storage unavailable */
    }
  };

  const dictate = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = navigator.language || 'en-IN';
    r.interimResults = true;
    r.continuous = false;
    const base = text ? text + ' ' : '';
    r.onresult = (e) => {
      let s = '';
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      setText(base + s);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  const act = async (a: Action) => {
    if (a.kind === 'settings') {
      window.dispatchEvent(new Event('dm-open-settings'));
      setOpen(false);
    } else if (a.kind === 'open' && a.arg) {
      router.push(a.arg);
      setOpen(false);
    } else if (a.kind === 'join' && a.arg) {
      router.push('/' + a.arg);
      setOpen(false);
    } else if (a.kind === 'new_meeting') {
      try {
        const res = await fetch('/api/rooms', { method: 'POST' });
        if (!res.ok) throw new Error();
        const d = (await res.json()) as { room: string; hostProof: string };
        try {
          localStorage.setItem('dm-host-' + d.room, d.hostProof);
        } catch {
          /* storage unavailable */
        }
        router.push('/' + d.room);
        setOpen(false);
      } catch {
        setMsgs((p) => [...p, { id: uid(), role: 'assistant', text: '', error: 'Could not start a meeting right now. Please try again.' }]);
      }
    }
  };

  const speechOk = typeof window !== 'undefined' && Boolean((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
  const last = msgs[msgs.length - 1];

  return (
    <>
      <button className={cx('chat-fab', open && 'is-open')} type="button" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Close assistant' : 'Open assistant'} aria-expanded={open}>
        <MessageCircle className="fab-ic a" />
        {unread > 0 && !open && <span className="chat-badge">{unread > 9 ? '9+' : unread}</span>}
        <X className="fab-ic b" />
      </button>

      {pres.mounted && (
        <div ref={panel} className={cx('chat-panel', pres.closing && 'is-closing')} role="dialog" aria-label="Dense Assistant">
          <header className="chat-head">
            <img src="/logo.png" alt="" width={34} height={34} />
            <div>
              <b>Dense Assistant</b>
              <span><i className={cx('dot', busy || live.status === 'requested' ? 'busy' : 'live')} /> {live.status === 'live' ? `${live.agent || 'An executive'} is here` : live.status === 'requested' ? 'Calling an executive' : busy ? 'Typing' : 'Online'}</span>
            </div>
            <button className="btn-icon" type="button" onClick={() => void connectAgent({ name: '', email: '', reason: '' })} disabled={live.status !== 'bot'} aria-label="Talk to a person" title="Talk to a person"><Headset /></button>
            <button className="btn-icon" type="button" onClick={() => setForm((v) => !v)} aria-label="Contact the team" title="Contact the team"><LifeBuoy /></button>
            <button className="btn-icon" type="button" onClick={clear} aria-label="New chat" title="New chat"><Trash2 /></button>
            <button className="btn-icon" type="button" onClick={() => setOpen(false)} aria-label="Close"><X /></button>
          </header>

          {live.status === 'requested' && (() => {
            const left = Math.max(0, Math.ceil((live.expAt - (Date.now() + live.skew)) / 1000));
            return (
              <div className="chat-banner wait" role="status">
                <span className="spin-s" />
                <div>
                  <b>Connecting you to a Dense AI executive</b>
                  <small>Waiting for someone to pick up: {left}s. If nobody is free, the assistant continues.</small>
                </div>
                <button type="button" onClick={() => void liveAction('cancel')}>Cancel</button>
              </div>
            );
          })()}
          {live.status === 'live' && (
            <div className="chat-banner live" role="status">
              <Headset />
              <div>
                <b>{live.agent || 'An executive'} from Dense AI</b>
                <small>You are chatting with a person.</small>
              </div>
              <button type="button" onClick={() => void liveAction('leave')}>End chat</button>
            </div>
          )}

          <div className="chat-body" ref={scroller} onScroll={onScroll}>
            {!msgs.length && (
              <div className="chat-welcome">
                <img src="/logo.png" alt="" width={56} height={56} />
                <h3>Hi, I'm Dense Assistant</h3>
                <p>Ask me anything: how Dense Meet works, fix a problem, or just a general question. I can also raise a support token for the Dense AI team.</p>
                <div className="chat-chips">
                  {CHIPS.map((c) => (
                    <button key={c} type="button" onClick={() => send(c)}>{c}</button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, idx) =>
              m.role === 'system' ? (
                <div key={m.id} className="chat-sys">{m.text}</div>
              ) : m.role === 'agent' ? (
                <div key={m.id} className="chat-msg assistant">
                  <div className="chat-bubble agent">
                    <small>{m.by || 'Dense AI executive'}</small>
                    {m.text}
                  </div>
                </div>
              ) : (
              <div key={m.id} className={cx('chat-msg', m.role)}>
                {m.role === 'assistant' ? (
                  <div className="chat-bubble">
                    {m.text ? <Markdown text={m.text} /> : !m.error && !m.ticket && !m.pending ? <span className="typing"><i /><i /><i /></span> : null}
                    {busy && idx === msgs.length - 1 && m.text && <span className="caret" />}
                    {m.pending && <div className="chat-note"><span className="spin-s" /> Creating your support token…</div>}
                    {m.ticket && <TicketCard t={m.ticket} />}
                    {m.error && <div className="chat-err">{m.error}</div>}
                    {m.actions && (
                      <div className="chat-actions">
                        {m.actions.map((a, i) => (
                          <button key={i} type="button" onClick={() => void act(a)}>
                            {a.kind === 'new_meeting' ? <Video /> : a.kind === 'settings' ? <Settings /> : a.kind === 'open' ? <History /> : <Video />}
                            {a.kind === 'new_meeting' ? 'Start a new meeting' : a.kind === 'join' ? `Join ${a.arg}` : a.kind === 'settings' ? 'Open Settings' : 'Open'}
                          </button>
                        ))}
                      </div>
                    )}
                    {m.text && !busy && (
                      <div className="chat-tools">
                        <CopyBtn text={m.text} />
                        {idx === msgs.length - 1 && <button type="button" onClick={retry} aria-label="Regenerate"><RotateCcw /> Retry</button>}
                      </div>
                    )}
                    {m.error && idx === msgs.length - 1 && !busy && (
                      <div className="chat-tools"><button type="button" onClick={retry}><RotateCcw /> Try again</button></div>
                    )}
                  </div>
                ) : (
                  <div className="chat-bubble">{m.text}</div>
                )}
              </div>
              ),
            )}

            {form && <TicketForm page={page} sid={sid.current} onClose={() => setForm(false)} onDone={(t) => { setForm(false); setMsgs((p) => [...p, { id: uid(), role: 'assistant', text: 'Your request is with the team. Keep this token handy.', ticket: t }]); }} />}
          </div>

          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <textarea
              ref={area}
              value={text}
              rows={1}
              maxLength={2000}
              placeholder={live.status === 'live' ? `Message ${live.agent || 'the executive'}` : live.status === 'requested' ? 'Message (the executive will see it)' : 'Message Dense Assistant'}
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
                  e.preventDefault();
                  send();
                }
              }}
              aria-label="Message"
            />
            {speechOk && !busy && !text && (
              <button className={cx('chat-round ghost', listening && 'on')} type="button" onClick={dictate} aria-label="Speak"><Mic /></button>
            )}
            {busy ? (
              <button className="chat-round" type="button" onClick={() => ctl.current?.abort()} aria-label="Stop"><Square /></button>
            ) : (
              <button className="chat-round" type="submit" disabled={!text.trim()} aria-label="Send"><ArrowUp /></button>
            )}
          </form>
          {last?.ticket && <div className="chat-foot">Support goes to densee.ai@gmail.com</div>}
        </div>
      )}
    </>
  );
}

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1400); })}
      aria-label="Copy reply"
    >
      {ok ? <Check /> : <Copy />} {ok ? 'Copied' : 'Copy'}
    </button>
  );
}

function TicketCard({ t }: { t: Ticket }) {
  const [ok, setOk] = useState(false);
  return (
    <div className={cx('chat-ticket', !t.sent && 'warn')}>
      <span>Support token</span>
      <div className="tok">
        <b>{t.token}</b>
        <button type="button" onClick={() => navigator.clipboard?.writeText(t.token).then(() => { setOk(true); setTimeout(() => setOk(false), 1400); })} aria-label="Copy token">
          {ok ? <Check /> : <Copy />}
        </button>
      </div>
      {t.sent ? (
        <p><Check /> Sent to the Dense AI team at {t.to}. Quote this token in any follow-up.</p>
      ) : (
        <>
          <p>The email could not be sent automatically. Tap below to send it yourself; the token is already filled in.</p>
          <a className="btn-primary small" href={t.mailto}><Mail /> Email {t.to}</a>
        </>
      )}
    </div>
  );
}

function TicketForm({ page, sid, onClose, onDone }: { page: string; sid: string; onClose: () => void; onDone: (t: Ticket) => void }) {
  const [f, setF] = useState({ name: '', email: '', topic: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/support', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, page, sid }) });
      const j = (await res.json()) as Ticket & { error?: string; detail?: string };
      if (!res.ok) throw new Error(j.error === 'bad_email' ? 'That email address does not look right.' : j.error === 'message_required' ? 'Please write what you need help with.' : j.detail || 'Could not send. Try again.');
      onDone({ token: j.token, sent: j.sent, to: j.to, mailto: j.mailto });
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="chat-form" onSubmit={submit}>
      <div className="chat-form-head">
        <b>Contact the team</b>
        <button className="btn-icon" type="button" onClick={onClose} aria-label="Close form"><X /></button>
      </div>
      <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Your name" maxLength={80} autoComplete="name" />
      <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email (so we can reply)" type="email" maxLength={120} autoComplete="email" />
      <input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="Topic" maxLength={80} />
      <textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="What do you need?" rows={4} maxLength={4000} required />
      {err && <div className="chat-err">{err}</div>}
      <button className="btn-primary" type="submit" disabled={busy || f.message.trim().length < 3}>{busy ? 'Sending…' : 'Get support token'}</button>
    </form>
  );
}
