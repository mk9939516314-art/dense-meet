'use client';

import { useEffect, useRef, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import type { ChatItem } from '@/lib/types';
import { clockTime, cx } from '@/lib/util';

export default function ChatPanel({ chat, onSend }: { chat: ChatItem[]; onSend: (t: string) => void }) {
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };

  return (
    <div className="panel-col">
      <div className="panel-scroll">
        {chat.length === 0 ? (
          <div className="empty">
            <strong>No messages yet</strong>
            <span>Messages are visible to everyone in the meeting and disappear when it ends.</span>
          </div>
        ) : (
          <ul className="chat-list">
            {chat.map((m) => (
              <li key={m.id} className={cx('chat-msg', m.mine && 'mine')}>
                <div className="chat-meta">
                  <b>{m.mine ? 'You' : m.from}</b>
                  <time>{clockTime(m.ts)}</time>
                </div>
                <p>{m.text}</p>
              </li>
            ))}
          </ul>
        )}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message everyone"
          aria-label="Message"
          maxLength={2000}
          autoComplete="off"
        />
        <button className="btn-icon primary" type="submit" aria-label="Send message" disabled={!text.trim()}>
          <SendHorizontal />
        </button>
      </form>
    </div>
  );
}
