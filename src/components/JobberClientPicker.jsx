import { useEffect, useRef, useState } from 'react';
import { Search, User, X, Loader2 } from 'lucide-react';

// Type a name, pick a client from Jobber. Calls onPick({ id, name, address, ... })
// or onPick(null) when cleared. Typing without picking still sets a plain name.
export default function JobberClientPicker({ value, picked, onType, onPick, status }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const q = (value || '').trim();
    if (q.length < 2 || picked) return undefined;
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/jobber-data?action=clients&q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => { if (!cancelled) setResults(Array.isArray(d) ? d.slice(0, 8) : []); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [value, picked]);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const shown = (value || '').trim().length >= 2 ? results : [];

  // Same box as the search bar, just filled in with the picked client.
  if (picked) {
    return (
      <div className="relative w-full rounded-lg border border-border-strong bg-card pl-9 pr-3 py-2.5 flex items-center gap-2 text-sm min-w-0">
        <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <span className="font-semibold text-primary truncate">{picked.name}</span>
        {picked.address && <span className="text-muted truncate">{picked.address}</span>}
        <span className="ml-auto shrink-0 flex items-center gap-2">
          {status && <span className="text-xs text-muted">{status}</span>}
          <button onClick={() => onPick(null)} className="p-0.5 text-muted hover:text-primary cursor-pointer" title="Change client"><X size={15} /></button>
        </span>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(e) => { onType(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search your Jobber clients…"
        className="w-full rounded-lg border border-border-strong bg-card pl-9 pr-9 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand placeholder:text-placeholder-muted"
      />
      {status && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{loading ? '' : status}</span>}
      {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted animate-spin" />}
      {open && shown.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-xl border border-border-default bg-card shadow-2xl overflow-hidden">
          {shown.map((c) => (
            <button
              key={c.id}
              onClick={() => { onPick(c); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 hover:bg-surface-alt flex items-center gap-3 cursor-pointer"
            >
              <User size={15} className="text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-primary truncate">{c.name}</p>
                <p className="text-[11px] text-muted truncate">{[c.address, c.city].filter(Boolean).join(', ') || c.phone || c.email}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && !loading && (value || '').trim().length >= 2 && shown.length === 0 && (
        <p className="absolute z-30 left-0 right-0 mt-1 rounded-xl border border-border-default bg-card shadow-xl px-3 py-2.5 text-xs text-muted">
          No Jobber client matches. You can still save under this name.
        </p>
      )}
    </div>
  );
}
