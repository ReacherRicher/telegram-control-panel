'use client';

import { useEffect, useRef, useState } from 'react';
import { api, useDebounced } from '@/lib/client';
import { CHAT_TYPES } from '@/lib/labels';

interface ChatOption { id: number; telegramId: string; title?: string; username?: string; type: string }

/**
 * Text input with autocomplete over synced chats. The user can still type any
 * @username, t.me link or invite link; picking a suggestion fills in @username or the chat id.
 */
export default function ChatPicker({
  value, onChange, placeholder = '@username, t.me link, or search your chats…', required, types, id,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; types?: string; id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ChatOption[]>([]);
  const [selected, setSelected] = useState<ChatOption | null>(null);
  const [hi, setHi] = useState(-1); // -1 = nothing highlighted, Enter keeps typed text
  const q = useDebounced(value, 250);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const term = q.trim().replace(/^@/, '');
    if (/^https?:\/\//.test(term)) { setOptions([]); return; }
    const params = new URLSearchParams({ search: term, limit: '8', filter: types || 'all' });
    api<ChatOption[]>(`/api/chats?${params}`).then((r) => { if (r.ok && r.data) { setOptions(r.data); setHi(-1); } });
  }, [q, open, types]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(o: ChatOption) {
    setSelected(o);
    onChange(o.username ? `@${o.username}` : o.telegramId);
    setOpen(false);
  }

  const showSelected = selected && (value === `@${selected.username}` || value === selected.telegramId);

  return (
    <div className="relative" ref={boxRef}>
      <input
        id={id}
        className="input pr-8"
        value={value}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setSelected(null); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hi < 0) { setOpen(false); return; }
          if (!open || options.length === 0) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(options.length - 1, h + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(options[hi]); }
          if (e.key === 'Escape' || e.key === 'Tab') setOpen(false);
        }}
      />
      {value && (
        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm" onClick={() => { onChange(''); setSelected(null); }} aria-label="Clear">✕</button>
      )}
      {showSelected && (
        <div className="text-xs text-slate-500 mt-1">
          {CHAT_TYPES[selected!.type]?.icon} <span dir="auto">{selected!.title}</span>
        </div>
      )}
      {open && options.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-auto py-1">
          {options.map((o, i) => (
            <li key={o.id}>
              <button
                type="button"
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${i === hi ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(o)}
              >
                <span className="w-5 text-center">{CHAT_TYPES[o.type]?.icon || '💬'}</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-medium text-slate-800" dir="auto">{o.title || '—'}</span>
                  <span className="block text-xs text-slate-400 truncate">{o.username ? `@${o.username}` : `ID ${o.telegramId}`} · {CHAT_TYPES[o.type]?.label || o.type}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
