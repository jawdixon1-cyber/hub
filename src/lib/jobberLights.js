// Shared Jobber helpers for the Lights pages.
import { useEffect, useState } from 'react';

export const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

// Fetch a Jobber list from /api/jobber-data, showing the last good copy right away.
export function useJobberList(action, field, enabled, tick = 0) {
  const key = `lights-jobber-${action}`;
  const [state, setState] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(key) || 'null');
      if (cached) return { [field]: cached, error: '', loading: false, cached: true };
    } catch { /* ignore */ }
    return { [field]: [], error: '', loading: false };
  });
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      setState((st) => ({ ...st, loading: true }));
      fetch(`/api/jobber-data?action=${action}${tick ? '&fresh=1' : ''}`)
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          if (d[field]) {
            try { localStorage.setItem(key, JSON.stringify(d[field])); } catch { /* full */ }
            setState({ [field]: d[field], error: '', loading: false });
          } else {
            // keep showing the last good copy if Jobber is busy
            setState((st) => ({ ...st, error: d.error || 'Jobber unavailable', loading: false }));
          }
        })
        .catch((e) => { if (alive) setState((st) => ({ ...st, error: e.message, loading: false })); });
    }, 0);
    return () => { alive = false; clearTimeout(t); };
  }, [enabled, tick, action, field, key]);
  return state;
}

// What a Hub quote's stage is, read from Jobber (by client name).
// Only "unqualified" is set by hand.
export const FOLLOW_UP_DAYS = 3;
export function quoteStage(sq, jobberQuotes) {
  const names = [sq.clientInfo?.name, sq.client].filter(Boolean).map(nameKey);
  const mine = (jobberQuotes || []).filter((q) => names.includes(nameKey(q.clientName)))
    .sort((a, b) => new Date(b.sentAt || b.createdAt || 0) - new Date(a.sentAt || a.createdAt || 0));
  const won = mine.find((q) => q.status === 'approved' || q.status === 'converted');
  if (won) return { key: 'sold', jq: won };
  if (sq.qStage === 'unqualified') return { key: 'unqualified' };
  const open = mine.find((q) => q.status === 'awaiting_response' || q.status === 'changes_requested');
  if (open) {
    const days = open.sentAt ? Math.floor((Date.now() - new Date(open.sentAt)) / 864e5) : 0;
    return { key: days >= FOLLOW_UP_DAYS ? 'follow' : 'sent', jq: open, days };
  }
  if (mine.find((q) => q.status === 'archived') && !mine.find((q) => q.status === 'draft')) return { key: 'lost', jq: mine[0] };
  return { key: 'notsent' };
}
export const STAGE_LABEL = {
  notsent: ['Not in Jobber yet', 'bg-yellow-500 text-black'],
  sent: ['Sent', 'bg-brand text-on-brand'],
  follow: ['Follow up', 'bg-red-500 text-white'],
  sold: ['Sold', 'bg-emerald-500 text-white'],
  unqualified: ['Unqualified', 'bg-black/60 text-white'],
  lost: ['Lost', 'bg-neutral-600 text-white'],
};
