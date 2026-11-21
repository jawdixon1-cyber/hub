import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Check, X, RefreshCw, Trash2 } from 'lucide-react';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';

// Plan: Jude's day in one fast page. Schedule (Jobber visits + Google Calendar), today's to-dos,
// habits with streaks, goals, and the running lists from his Notes "Today" note:
// Can't wait · Implement · Can wait · Brain dump. "Organize my day" (AI) only runs on tap and
// only suggests; nothing moves until he taps Apply.
// Saved in the shared store (greenteam-planner), merged so two tabs don't overwrite each other.

const TZ = 'America/New_York';
const ymd = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
const shift = (dateStr, n) => { const d = new Date(`${dateStr}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Before 3 PM: today. After: tomorrow (the 5 PM step plans the next day).
const defaultDay = () => { const now = new Date(); const h = Number(now.toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false })); return h >= 15 ? shift(ymd(now), 1) : ymd(now); };
const newId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const time = (iso) => new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

const LISTS = [
  { key: 'cantWait', label: "Can't wait" },
  { key: 'implement', label: 'Implement' },
  { key: 'canWait', label: 'Can wait' },
  { key: 'brainDump', label: 'Brain dump' },
];
const EMPTY = { habits: [], habitLog: {}, goals: [], lists: { cantWait: [], implement: [], canWait: [], brainDump: [] }, days: {} };

export default function Plan({ embedded = false }) {
  const raw = useAppStore((s) => s.plannerData);
  const videoIdeas = useAppStore((s) => s.socialIdeas) || [];
  const setRaw = useAppStore((s) => s.setPlannerData);
  const data = useMemo(() => ({ ...EMPTY, ...(raw || {}), lists: { ...EMPTY.lists, ...(raw?.lists || {}) } }), [raw]);
  const save = (fn) => setRaw(fn(data));

  const [date, setDate] = useState(defaultDay);
  const day = data.days[date] || { todos: [] };
  const setDay = (patch) => save((d) => ({ ...d, days: { ...d.days, [date]: { ...(d.days[date] || { todos: [] }), ...patch } } }));

  const { session } = useAuth();
  const token = session?.access_token || '';
  const [sched, setSched] = useState({ loading: true, visits: [], events: [], errors: {}, calendarsConnected: [] });
  const loadSched = useCallback(async () => {
    if (!token) return;
    setSched((s) => ({ ...s, loading: true }));
    try {
      const r = await fetch(`/api/plan-day?date=${date}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      setSched({ loading: false, ...d });
    } catch (e) { setSched({ loading: false, visits: [], events: [], errors: { load: e.message }, calendarsConnected: [] }); }
  }, [date, token]);
  useEffect(() => { loadSched(); }, [loadSched]);

  // ── list helpers ──
  const findItem = (id) => {
    if ((day.todos || []).some((x) => x.id === id)) return 'today';
    if (data.goals.some((x) => x.id === id)) return 'goals';
    return Object.keys(data.lists).find((k) => data.lists[k].some((x) => x.id === id)) || null;
  };
  const moveItem = (id, to) => {
    const from = findItem(id); if (!from || from === to) return;
    const item = from === 'today' ? day.todos.find((x) => x.id === id) : from === 'goals' ? data.goals.find((x) => x.id === id) : data.lists[from].find((x) => x.id === id);
    if (!item) return;
    save((d) => {
      const strip = (arr) => (arr || []).filter((x) => x.id !== id);
      const out = { ...d, days: { ...d.days }, lists: { ...d.lists } };
      out.days[date] = { ...(d.days[date] || { todos: [] }), todos: strip(d.days[date]?.todos) };
      for (const k of Object.keys(out.lists)) out.lists[k] = strip(out.lists[k]);
      out.goals = strip(d.goals);
      if (to === 'done') return out;
      if (to === 'today') out.days[date].todos = [...out.days[date].todos, { ...item, done: false }];
      else out.lists[to] = [{ ...item, done: false }, ...(out.lists[to] || [])];
      return out;
    });
  };


  // Old checklist items (every day's to-dos, goals, all lists) that aren't done yet.
  // Only copied into the note when Jude taps the button; the originals stay saved.
  const oldItems = [
    ...Object.keys(data.days).sort().flatMap((k) => data.days[k]?.todos || []),
    ...data.goals,
    ...Object.values(data.lists).flat(),
  ].filter((x) => x && !x.done && x.text);
  const pullOld = () => save((d) => {
    const have = d.notes || '';
    const lines = [...new Set(oldItems.map((x) => x.text.trim()))].filter((t) => !have.includes(t));
    return { ...d, notesImported: true, notes: [have.trimEnd(), lines.join('\n')].filter(Boolean).join('\n') };
  });

  // ── habits ──
  const doneHabit = (hid, d = date) => !!data.habitLog?.[d]?.[hid];
  const toggleHabit = (hid) => save((d) => ({ ...d, habitLog: { ...d.habitLog, [date]: { ...(d.habitLog?.[date] || {}), [hid]: !doneHabit(hid) } } }));
  const streak = (hid) => { let n = 0; let d = doneHabit(hid, date) ? date : shift(date, -1); while (doneHabit(hid, d) && n < 999) { n++; d = shift(d, -1); } return n; };

  // ── AI ──
  const [ai, setAi] = useState({ loading: false, plan: day.aiPlan || null, error: null });
  useEffect(() => { setAi({ loading: false, plan: (data.days[date] || {}).aiPlan || null, error: null }); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  const organize = async () => {
    setAi({ loading: true, plan: ai.plan, error: null });
    try {
      const r = await fetch('/api/plan-ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date, events: sched.events, visits: sched.visits, today: day.todos || [], lists: data.lists, goals: data.goals, habits: data.habits }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      // Only keep moves to lists still shown on the page.
      const plan = { ...d, moves: (d.moves || []).filter((m) => ['done', 'brainDump'].includes(m.to)) };
      setAi({ loading: false, plan, error: null });
      setDay({ aiPlan: plan });
    } catch (e) { setAi({ loading: false, plan: ai.plan, error: e.message }); }
  };
  const applyMoves = () => { for (const m of ai.plan?.moves || []) moveItem(m.id, m.to); const p = { ...ai.plan, moves: [] }; setAi({ ...ai, plan: p }); setDay({ aiPlan: p }); };
  const labelOf = (id) => [...(day.todos || []), ...Object.values(data.lists).flat()].find((x) => x.id === id)?.text;

  const dateLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const dateShort = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const rel = date === ymd(new Date()) ? 'Today' : date === shift(ymd(new Date()), 1) ? 'Tomorrow' : date === shift(ymd(new Date()), -1) ? 'Yesterday' : null;
  const crewCounts = sched.visits.reduce((m, v) => { for (const c of v.crew.length ? v.crew : ['Unassigned']) m[c] = (m[c] || 0) + 1; return m; }, {});
  const myStops = sched.visits.filter((v) => v.crew.some((c) => /^jude/i.test(c)));

  const schedRows = [
    ...sched.events.map((e) => ({ id: e.id, start: e.start, allDay: e.allDay, title: e.title, kind: e.calendar || 'Calendar', sub: e.location || '' })),
    ...myStops.map((v) => ({ id: v.id, start: v.start, allDay: v.allDay, title: v.client || v.title, kind: 'Job', sub: v.address, done: v.done })),
    ...(sched.assessments || []).map((a) => ({ id: a.id, start: a.start, allDay: a.allDay, title: a.client || a.title, kind: 'Quote', sub: [a.title !== a.client ? a.title : '', a.address].filter(Boolean).join(' · '), done: a.done })),
    ...(sched.tasks || []).map((t) => ({ id: t.id, start: t.start, allDay: t.allDay, title: t.title, kind: 'Task', done: t.done,
      sub: t.crew.length && !t.crew.some((c) => /^jude/i.test(c)) ? t.crew.map((c) => c.split(' ')[0]).join(', ') : '' })),
  ].sort((x, y) => (x.allDay !== y.allDay ? (x.allDay ? 1 : -1) : new Date(x.start) - new Date(y.start)));

  // Apple-Notes style: one plain page, bold headings, round checks, just type under each heading.
  return (
    <div className={embedded ? '' : 'px-4 sm:px-6 py-5 sm:py-8 max-w-2xl mx-auto'}>
      {/* Day header */}
      <div className="flex items-center gap-1 mb-1">
        <button onClick={() => setDate(shift(date, -1))} className="p-1.5 -ml-1.5 rounded-lg text-muted hover:text-primary cursor-pointer" title="Previous day"><ChevronLeft size={18} /></button>
        <p className="text-xs font-semibold text-muted">{rel ? `${rel} · ` : ''}{dateShort}</p>
        <button onClick={() => setDate(shift(date, 1))} className="p-1.5 rounded-lg text-muted hover:text-primary cursor-pointer" title="Next day"><ChevronRight size={18} /></button>
        <button onClick={organize} disabled={ai.loading} title="AI suggests a plan. Nothing changes until you tap Apply."
          className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-brand cursor-pointer disabled:opacity-50">
          <Sparkles size={13} /> {ai.loading ? 'Planning…' : ai.plan ? 'Re-plan' : 'Organize'}
        </button>
      </div>
      <h1 className="text-3xl font-bold text-primary leading-tight mb-6">{dateLabel}</h1>

      {ai.error && <p className="text-sm text-rose-400 mb-4">{ai.error}</p>}
      {ai.plan && (
        <div className="mb-8 border-l-2 border-brand pl-3 relative">
          <button onClick={() => { setAi({ ...ai, plan: null }); setDay({ aiPlan: null }); }} title="Clear plan" className="absolute right-0 top-0 p-1 text-muted hover:text-primary cursor-pointer"><X size={14} /></button>
          <p className="text-sm font-bold text-primary mb-1">Top 3</p>
          <ol className="list-decimal pl-5 text-[15px] text-primary space-y-0.5 mb-2">{ai.plan.top3.map((t, i) => <li key={i}>{t}</li>)}</ol>
          {ai.plan.blocks?.length > 0 && (
            <div className="mb-2">{ai.plan.blocks.map((b, i) => <p key={i} className="text-sm text-primary"><span className="inline-block w-28 text-muted">{b.time}</span>{b.what}</p>)}</div>
          )}
          {ai.plan.note && <p className="text-sm text-secondary italic mb-2">{ai.plan.note}</p>}
          {ai.plan.moves?.length > 0 && (
            <div className="mt-2">
              {ai.plan.moves.filter((m) => labelOf(m.id)).map((m) => (
                <p key={m.id} className="text-sm text-secondary">→ <b className="text-primary font-semibold">{labelOf(m.id)}</b> to {m.to === 'today' ? 'today' : m.to === 'done' ? 'done' : LISTS.find((l) => l.key === m.to)?.label} <span className="text-muted">· {m.why}</span></p>
              ))}
              <div className="flex gap-3 mt-1.5">
                <button onClick={applyMoves} className="text-sm font-semibold text-brand hover:underline cursor-pointer">Apply moves</button>
                <button onClick={() => { const p = { ...ai.plan, moves: [] }; setAi({ ...ai, plan: p }); setDay({ aiPlan: p }); }} className="text-sm text-muted hover:text-primary cursor-pointer">Skip</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Schedule */}
      <Section title="Schedule" right={<button onClick={loadSched} title="Refresh" className="text-muted hover:text-primary cursor-pointer"><RefreshCw size={12} className={sched.loading ? 'animate-spin' : ''} /></button>}>
        {Object.values(sched.errors || {}).map((e) => <p key={e} className="text-xs text-rose-400">{e}</p>)}
        {Object.values(sched.errors || {}).some((e) => /Connect Gmail again/i.test(e)) && (
          <button onClick={async () => {
            const r = await fetch(`/api/gmail?action=connect&returnTo=${encodeURIComponent(window.location.pathname)}`, { headers: { Authorization: `Bearer ${token}` } });
            const d = await r.json().catch(() => ({}));
            if (d.url) window.location.href = d.url;
          }} className="my-1 text-sm font-semibold text-brand hover:underline cursor-pointer">Connect calendar</button>
        )}
        {schedRows.map((x) => (
          <div key={x.id} className="flex gap-3 py-1 items-baseline">
            <span className="w-16 shrink-0 text-sm text-muted tabular-nums">{x.allDay ? 'All day' : time(x.start)}</span>
            <p className={`text-[15px] flex-1 min-w-0 ${x.done ? 'text-tertiary line-through' : 'text-primary'}`}>
              {x.title}
              <span className="text-sm text-muted"> · {x.kind === 'Job' || x.kind === 'Quote' || x.kind === 'Task' ? x.kind.toLowerCase() : x.kind}{x.sub ? ` · ${x.sub}` : ''}</span>
            </p>
          </div>
        ))}
        {Object.keys(crewCounts).length > 0 && (
          <p className="text-sm text-muted pt-1">Crew: {Object.entries(crewCounts).map(([c, n]) => `${c.split(' ')[0]} ${n} stop${n === 1 ? '' : 's'}`).join(' · ')}</p>
        )}
        {!sched.loading && !schedRows.length && <p className="text-sm text-muted py-1">Nothing on the calendar.</p>}
        {!sched.loading && !sched.calendarsConnected?.length && <p className="text-xs text-amber-400 pt-1">Google Calendar isn't connected yet.</p>}
      </Section>

      {/* Notes: one running note for every day, just type. */}
      <Section title="Notes" right={!data.notesImported && oldItems.length > 0 && (
        <button onClick={pullOld} className="text-xs font-semibold text-muted hover:text-brand cursor-pointer">+ Pull in {oldItems.length} old items</button>
      )}>
        <NoteBox value={data.notes || ''} onChange={(v) => save((d) => ({ ...d, notes: v }))} />
      </Section>

      <Section title="Habits">
        {data.habits.map((h) => (
          <div key={h.id} className="flex items-start gap-2.5 py-1 group">
            <span className="pt-0.5"><Box on={doneHabit(h.id)} onClick={() => toggleHabit(h.id)} /></span>
            <div className="flex-1 min-w-0">
              <p className={`text-[15px] ${doneHabit(h.id) ? 'text-tertiary' : 'text-primary'}`}>
                {h.name}{streak(h.id) > 0 && <span className="text-sm text-muted"> · 🔥 {streak(h.id)}</span>}
              </p>
              {/video|post|tiktok|reel/i.test(h.name) && (() => {
                // Next video to post: something already filmed, else the newest idea (Social media tab).
                const next = videoIdeas.find((i) => i.status === 'filmed') || videoIdeas.find((i) => (i.status || 'idea') === 'idea');
                return (
                  <a href="/social" className="text-xs text-muted hover:text-brand">
                    {next ? `Next up: ${next.title}${next.status === 'filmed' ? ' (filmed, ready to post)' : ''}` : 'No video ideas yet. Add some in Social media →'}
                  </a>
                );
              })()}
            </div>
            <button onClick={() => save((d) => ({ ...d, habits: d.habits.filter((x) => x.id !== h.id) }))} className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-rose-400 cursor-pointer" title="Remove habit"><Trash2 size={12} /></button>
          </div>
        ))}
        <AddLine onAdd={(t) => save((d) => ({ ...d, habits: [...d.habits, { id: newId(), name: t }] }))} />
      </Section>

    </div>
  );
}

function Section({ title, right, children }) {
  return (
    <section className="mb-7">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-lg font-bold text-primary flex-1">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

// Round check, like Apple Notes.
function Box({ on, onClick }) {
  return (
    <button onClick={onClick} className={`shrink-0 w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center cursor-pointer transition-colors ${on ? 'bg-brand border-brand' : 'border-muted/50 hover:border-brand'}`}>
      {on && <Check size={11} strokeWidth={3.5} className="text-black" />}
    </button>
  );
}



// Plain auto-growing note, like Apple Notes. Keeps its own text while typing so a cloud
// refresh never yanks the cursor; picks up changes from other devices when not focused.
function NoteBox({ value, onChange }) {
  const [v, setV] = useState(value);
  const [focused, setFocused] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }, [v, value]);
  return (
    <textarea ref={ref} value={focused ? v : value} rows={6} placeholder="Start typing…"
      onFocus={() => { setV(value); setFocused(true); }} onBlur={() => setFocused(false)}
      onChange={(e) => { setV(e.target.value); onChange(e.target.value); }}
      className="w-full bg-transparent text-[15px] leading-relaxed text-primary outline-none resize-none placeholder:text-muted/50 overflow-hidden" />
  );
}

// An empty check line you just type into, like the next line of a note.
function AddLine({ onAdd }) {
  const [v, setV] = useState('');
  return (
    <div className="flex items-center gap-2.5 py-1">
      <span className="shrink-0 w-[18px] h-[18px] rounded-full border-[1.5px] border-dashed border-muted/30" />
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onAdd(v); setV(''); } }}
        placeholder="New habit" className="flex-1 bg-transparent text-[15px] text-primary outline-none placeholder:text-muted/50" />
    </div>
  );
}
