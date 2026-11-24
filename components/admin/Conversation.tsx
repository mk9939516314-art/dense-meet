'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Headset, LogOut, Mail, Send, Ticket } from 'lucide-react';
import { ago, api, type Msg, type Sess } from './types';
import { cx } from '@/lib/util';

type Res = { sess: Sess; total: number; msgs: Msg[] };

/** One customer's whole conversation. Live while open; the executive can join, reply and hand back to the bot. */
export default function Conversation({ sid, summary, onBack, onChanged, openTicket }: { sid: string; summary?: Sess; onBack: () => void; onChanged: () => void; openTicket: (t: string) => void }) {
  const [sess, setSess] = useState<Sess | null>(summary || null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const n = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMsgs([]);
    n.current = 0;
    setSess(summary || null);
    stick.current = true;
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await api<Res>(`/api/admin/session?sid=${encodeURIComponent(sid)}&n=${n.current}`);
        if (stop) return;
        if (r.ok) {
          setSess(r.data.sess);
          if (r.data.msgs.length) {
            setMsgs((p) => {
              const seen = new Set(p.map((m) => m.id));
              return [...p, ...r.data.msgs.filter((m) => !seen.has(m.id))];
            });
          }
          n.current = r.data.total;
        }
      } catch {
        /* keep polling */
      }
      if (!stop) t = setTimeout(tick, document.hidden ? 5000 : 1400);
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid]);

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const act = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      setBusy(true);
      setErr('');
      const r = await api<{ error?: string; detail?: string }>('/api/admin/act', { action, sid, ...extra });
      setBusy(false);
      if (!r.ok) setErr(r.data.detail || 'That did not work.');
      onChanged();
      return r.ok;
    },
    [sid, onChanged],
  );

  const send = async () => {
    const v = text.trim();
    if (!v || busy) return;
    setText('');
    if (area.current) area.current.style.height = '';
    stick.current = true;
    await act('send', { text: v });
  };

  const live = sess?.status === 'live';
  const requested = sess?.status === 'requested';

  return (
    <section className="ad-conv">
      <header className="ad-conv-head">
        <button className="btn-icon ad-back" type="button" onClick={onBack} aria-label="Back"><ArrowLeft /></button>
        <div className="ad-av">{(sess?.name || 'G').slice(0, 1).toUpperCase()}</div>
        <div className="ad-conv-who">
          <b>{sess?.name || 'Guest'}</b>
          <span>
            {sess?.email || 'no email'} · {sess?.page || 'home'} · {sess ? ago(sess.at) : ''}
          </span>
        </div>
        <span className={cx('ad-badge', sess?.status)}>{sess?.status === 'bot' ? 'Assistant' : sess?.status === 'requested' ? 'Wants executive' : sess?.status === 'live' ? 'Live with you' : 'Closed'}</span>
      </header>

      <div className="ad-conv-bar">
        {sess?.ticket && (
          <button type="button" className="ad-chip" onClick={() => openTicket(sess.ticket!)}>
            <Ticket /> {sess.ticket}
          </button>
        )}
        {sess?.email && (
          <a className="ad-chip" href={`mailto:${sess.email}${sess.ticket ? `?subject=${encodeURIComponent('Re: [' + sess.ticket + ']')}` : ''}`}>
            <Mail /> Email
          </a>
        )}
        <button type="button" className="ad-chip" onClick={() => navigator.clipboard?.writeText(sid).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}>
          {copied ? <Check /> : <Copy />} Chat ID
        </button>
        <span className="grow" />
        {requested && (
          <>
            <button type="button" className="btn-primary small" disabled={busy} onClick={() => void act('accept')}><Headset /> Accept</button>
            <button type="button" className="btn-ghost small" disabled={busy} onClick={() => void act('decline')}>Decline</button>
          </>
        )}
        {!live && !requested && (
          <button type="button" className="btn-primary small" disabled={busy} onClick={() => void act('takeover')}><Headset /> Join chat</button>
        )}
        {live && (
          <button type="button" className="btn-ghost small" disabled={busy} onClick={() => void act('end')}><LogOut /> Hand back to bot</button>
        )}
      </div>

      <div
        className="ad-msgs"
        ref={box}
        onScroll={() => {
          const el = box.current;
          if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {!msgs.length && <p className="ad-empty">No messages yet.</p>}
        {msgs.map((m) =>
          m.role === 'system' ? (
            <div key={m.id} className="ad-sys">{m.text}</div>
          ) : (
            <div key={m.id} className={cx('ad-m', m.role)}>
              <small>{m.role === 'user' ? sess?.name || 'Customer' : m.role === 'bot' ? 'Assistant' : m.by || 'You'} · {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
              <div>{m.text}</div>
            </div>
          ),
        )}
      </div>

      {err && <div className="notice warn" role="alert">{err}</div>}
      <form className="ad-compose" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <textarea
          ref={area}
          rows={1}
          value={text}
          placeholder={live ? 'Reply to the customer' : 'Type to join and reply'}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="chat-round" type="submit" disabled={!text.trim() || busy} aria-label="Send"><Send /></button>
      </form>
    </section>
  );
}
