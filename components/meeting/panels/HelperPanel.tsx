'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, SendHorizontal } from 'lucide-react';
import { useHelper } from '@/hooks/useAi';
import { cx } from '@/lib/util';

const SUGGESTIONS = ['What services does Dense AI offer?', 'How does Dense AI check quality?', 'How do pilots work?', 'How do I use this meeting?'];

export default function HelperPanel({ token, configured }: { token: { current: string }; configured: boolean | null }) {
  const { messages, loading, error, detail, ask } = useHelper(token);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, loading]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    ask(text);
    setText('');
  };

  return (
    <div className="panel-col">
      <div className="panel-scroll">
        <div className="helper-intro">
          <span className="helper-mark">
            <Sparkles />
          </span>
          <div>
            <strong>Dense AI Helper</strong>
            <span>Ask about Dense AI or how to use this meeting. It does not answer other topics.</span>
          </div>
        </div>

        {configured === false && (
          <div className="notice warn">
            The AI is not connected yet. The host needs to add the AI key in the project settings.
          </div>
        )}

        {messages.length === 0 && configured !== false && (
          <div className="chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip-btn" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        <ul className="chat-list">
          {messages.map((m, i) => (
            <li key={i} className={cx('chat-msg', m.role === 'user' ? 'mine' : 'ai')}>
              <div className="chat-meta">
                <b>{m.role === 'user' ? 'You' : 'AI Helper'}</b>
              </div>
              <p>{m.content}</p>
            </li>
          ))}
          {loading && (
            <li className="chat-msg ai">
              <div className="typing" aria-label="AI is typing">
                <i />
                <i />
                <i />
              </div>
            </li>
          )}
        </ul>
        {error && error !== 'not_configured' && (
          <div className="notice warn">{error === 'busy' ? 'You are asking too fast. Wait a few seconds.' : 'The AI could not answer right now. Try again.'}{error === 'failed' && detail ? <><br /><span className="tiny muted">{detail}</span></> : null}</div>
        )}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask about Dense AI"
          aria-label="Ask the AI Helper"
          maxLength={800}
          autoComplete="off"
          disabled={configured === false}
        />
        <button className="btn-icon primary" type="submit" aria-label="Send" disabled={!text.trim() || loading || configured === false}>
          <SendHorizontal />
        </button>
      </form>
    </div>
  );
}
