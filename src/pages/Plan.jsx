import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Plus, Check, X, CalendarDays, RefreshCw, Flame, Target, Trash2 } from 'lucide-react';
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
  const addTo = (where, text) => {
    const t = text.trim(); if (!t) return;
    const item = { id: newId(), text: t, done: false, createdAt: new Date().toISOString() };
    if (where === 'today') setDay({ todos: [...(day.todos || []), item] });
    else if (where === 'goals') save((d) => ({ ...d, goals: [...d.goals, item] }));
    else save((d) => ({ ...d, lists: { ...d.lists, [where]: [item, ...(d.lists[where] || [])] } }));
  };
  const findItem = (id) => {
    if ((day.todos || []).some((x) => x.id === id)) return 'today';
    if (data.goals.some((x) => x.id === id)) return 'goals';
    return Object.keys(data.lists).find((k) => data.lists[k].some((x) => x.id === id)) || null;
  };
  const patchItem = (id, patch) => save((d) => {
    const days = { ...d.days, [date]: { ...(d.days[date] || { todos: [] }), todos: (d.days[date]?.todos || []).map((x) => (x.id === id ? { ...x, ...patch } : x)) } };
    const lists = Object.fromEntries(Object.entries(d.lists).map(([k, arr]) => [k, arr.map((x) => (x.id === id ? { ...x, ...patch } : x))]));
    return { ...d, days, lists, goals: d.goals.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
  });
  const removeItem = (id) => save((d) => ({
    ...d,
    days: { ...d.days, [date]: { ...(d.days[date] || { todos: [] }), todos: (d.days[date]?.todos || []).filter((x) => x.id !== id) } },
    lists: Object.fromEntries(Object.entries(d.lists).map(([k, arr]) => [k, arr.filter((x) => x.id !== id)])),
    goals: d.goals.filter((x) => x.id !== id),
  }));
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

  // Unfinished to-dos from the day before can be pulled forward in one tap.
  const prev = data.days[shift(date, -1)];
  const leftover = (prev?.todos || []).filter((x) => !x.done && !(day.todos || []).some((t) => t.text === x.text));

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
      setAi({ loading: false, plan: d, error: null });
      setDay({ aiPlan: d });
    } catch (e) { setAi({ loading: false, plan: ai.plan, error: e.message }); }
  };
  const applyMoves = () => { for (const m of ai.plan?.moves || []) moveItem(m.id, m.to); const p = { ...ai.plan, moves: [] }; setAi({ ...ai, plan: p }); setDay({ aiPlan: p }); };
  const labelOf = (id) => [...(day.todos || []), ...Object.values(data.lists).flat()].find((x) => x.id === id)?.text;

  const dateLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const dateShort = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const rel = date === ymd(new Date()) ? 'Today' : date === shift(ymd(new Date()), 1) ? 'Tomorrow' : date === shift(ymd(new Date()), -1) ? 'Yesterday' : null;
  const crewCounts = sched.visits.reduce((m, v) => { for (const c of v.crew.length ? v.crew : ['Unassigned']) m[c] = (m[c] || 0) + 1; return m; }, {});
  const myStops = sched.visits.filter((v) => v.crew.some((c) => /^jude/i.test(c)));

  return (
    <div className={embedded ? '' : 'px-3 sm:px-6 py-4 sm:py-6 max-w-6xl mx-auto'}>
      {/* Day header */}
      <div className="flex items-center gap-1 sm:gap-2 mb-4 flex-wrap">
        <button onClick={() => setDate(shift(date, -1))} className="p-2 -ml-2 rounded-xl hover:bg-surface-alt text-muted hover:text-primary cursor-pointer" title="Previous day"><ChevronLeft size={20} /></button>
        <div className="min-w-0 flex-1 sm:flex-none text-center sm:text-left">
          <p className="text-[11px] font-black uppercase tracking-[0.15em] text-brand">{rel || 'Plan'}</p>
          <h1 className="text-xl sm:text-2xl font-black text-primary leading-tight">
            <span className="sm:hidden">{dateShort}</span><span className="hidden sm:inline">{dateLabel}</span>
          </h1>
        </div>
        <button onClick={() => setDate(shift(date, 1))} className="p-2 -mr-2 sm:mr-0 rounded-xl hover:bg-surface-alt text-muted hover:text-primary cursor-pointer" title="Next day"><ChevronRight size={20} /></button>
        <button onClick={organize} disabled={ai.loading}
          className="w-full sm:w-auto sm:ml-auto mt-2 sm:mt-0 inline-flex items-center justify-center gap-1.5 bg-brand text-black font-black text-sm sm:text-base px-4 py-2 rounded-2xl hover:brightness-110 cursor-pointer disabled:opacity-50">
          <Sparkles size={15} /> {ai.loading ? 'Planning…' : ai.plan ? 'Re-plan with AI' : 'Organize my day'}
        </button>
      </div>

      {ai.error && <p className="text-sm font-bold text-rose-400 mb-3">{ai.error}</p>}
      {ai.plan && (
        <section className="rounded-3xl border border-brand/40 bg-brand/5 p-4 mb-4">
          <div className="flex items-start gap-2">
            <Sparkles size={16} className="text-brand mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-primary mb-1">Top 3</p>
              <ol className="list-decimal pl-5 text-sm text-primary space-y-0.5 mb-2">{ai.plan.top3.map((t, i) => <li key={i}>{t}</li>)}</ol>
              {ai.plan.blocks?.length > 0 && (
                <div className="grid gap-0.5 mb-2">
                  {ai.plan.blocks.map((b, i) => <p key={i} className="text-xs text-primary"><span className="inline-block w-32 text-muted font-bold">{b.time}</span>{b.what}</p>)}
                </div>
              )}
              {ai.plan.note && <p className="text-xs text-secondary italic mb-2">{ai.plan.note}</p>}
              {ai.plan.moves?.length > 0 && (
                <div className="rounded-2xl bg-card border border-card-border p-3">
                  <p className="text-xs font-black text-primary mb-1">Suggested moves</p>
                  {ai.plan.moves.filter((m) => labelOf(m.id)).map((m) => (
                    <p key={m.id} className="text-xs text-secondary">→ <b className="text-primary">{labelOf(m.id)}</b> to {m.to === 'today' ? 'today' : m.to === 'done' ? 'done' : LISTS.find((l) => l.key === m.to)?.label} <span className="text-muted">· {m.why}</span></p>
                  ))}
                  <div className="flex gap-2 mt-2">
                    <button onClick={applyMoves} className="text-xs font-black bg-brand text-black px-3 py-1.5 rounded-xl cursor-pointer">Apply moves</button>
                    <button onClick={() => { const p = { ...ai.plan, moves: [] }; setAi({ ...ai, plan: p }); setDay({ aiPlan: p }); }} className="text-xs font-bold text-muted hover:text-primary px-2 cursor-pointer">Skip</button>
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => { setAi({ ...ai, plan: null }); setDay({ aiPlan: null }); }} title="Clear plan" className="p-1 text-muted hover:text-primary cursor-pointer"><X size={14} /></button>
          </div>
        </section>
      )}

      {/* Schedule: full width on top */}
      <div className="mb-4">
          <Card title="Schedule" icon={CalendarDays} right={<button onClick={loadSched} title="Refresh" className="text-muted hover:text-primary cursor-pointer"><RefreshCw size={13} className={sched.loading ? 'animate-spin' : ''} /></button>}>
          {Object.values(sched.errors || {}).map((e) => <p key={e} className="text-xs font-bold text-rose-400">{e}</p>)}
          {Object.values(sched.errors || {}).some((e) => /Connect Gmail again/i.test(e)) && (
            <button onClick={async () => {
              const r = await fetch(`/api/gmail?action=connect&returnTo=${encodeURIComponent(window.location.pathname)}`, { headers: { Authorization: `Bearer ${token}` } });
              const d = await r.json().catch(() => ({}));
              if (d.url) window.location.href = d.url;
            }} className="mt-1 mb-1 inline-flex items-center gap-1.5 text-xs font-black text-black bg-brand px-3 py-1.5 rounded-xl cursor-pointer hover:brightness-110">
              <CalendarDays size={13} /> Connect calendar
            </button>
          )}
          {/* One list: timed things first (by time), then all-day. Each tagged Job / Task / Calendar. */}
          {[
            ...sched.events.map((e) => ({ id: e.id, start: e.start, allDay: e.allDay, title: e.title, kind: e.calendar || 'Calendar', sub: e.location || '', tone: /work/i.test(e.calendar || '') ? 'text-yellow-300' : 'text-sky-400' })),
            ...myStops.map((v) => ({ id: v.id, start: v.start, allDay: v.allDay, title: v.client || v.title, kind: 'Job', sub: v.address, done: v.done, tone: 'text-yellow-300' })),
            ...(sched.assessments || []).map((a) => ({ id: a.id, start: a.start, allDay: a.allDay, title: a.client || a.title, kind: 'Quote', sub: [a.title !== a.client ? a.title : '', a.address].filter(Boolean).join(' · '), done: a.done, tone: 'text-yellow-300' })),
            ...(sched.tasks || []).filter((t) => !t.allDay).map((t) => ({ id: t.id, start: t.start, allDay: t.allDay, title: t.title, kind: 'Task', done: t.done, tone: 'text-yellow-300',
              sub: t.crew.length && !t.crew.some((c) => /^jude/i.test(c)) ? t.crew.map((c) => c.split(' ')[0]).join(', ') : '' })),
          ].sort((x, y) => (x.allDay !== y.allDay ? (x.allDay ? 1 : -1) : new Date(x.start) - new Date(y.start))).map((x) => (
            <div key={x.id} className="flex flex-col sm:flex-row sm:gap-2 py-2 sm:py-1.5 sm:items-baseline border-b sm:border-0 border-card-border/60 last:border-0">
              <div className="flex items-baseline gap-2 sm:contents">
                <span className="sm:w-16 shrink-0 text-xs font-bold text-muted">{x.allDay ? 'All day' : time(x.start)}</span>
                <span className={`sm:w-16 shrink-0 text-[10px] font-black uppercase ${x.tone}`}>{x.kind}</span>
              </div>
              <p className={`text-[15px] sm:text-sm flex-1 min-w-0 mt-0.5 sm:mt-0 ${x.done ? 'text-tertiary line-through' : 'text-primary'}`}>
                {x.title}{x.sub ? <span className="text-xs text-muted"> · {x.sub}</span> : null}
              </p>
            </div>
          ))}
          {/* Tasks with no time: their own block, spaced off from the timed schedule */}
          {(sched.tasks || []).some((t) => t.allDay) && (
            <div className="mt-4 pt-3 border-t border-card-border">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted mb-1">Tasks (no set time)</p>
              {(sched.tasks || []).filter((t) => t.allDay).map((t) => (
                <div key={t.id} className="flex items-start gap-2 py-1.5">
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${t.done ? 'bg-yellow-300/30' : 'bg-yellow-300'}`} />
                  <p className={`text-sm flex-1 ${t.done ? 'text-tertiary line-through' : 'text-primary'}`}>
                    {t.title}
                    {t.crew.length > 0 && !t.crew.some((c) => /^jude/i.test(c)) && <span className="text-xs text-muted"> · {t.crew.map((c) => c.split(' ')[0]).join(', ')}</span>}
                  </p>
                </div>
              ))}
            </div>
          )}
          {Object.keys(crewCounts).length > 0 && (
            <p className="text-xs text-muted pt-1">Crew: {Object.entries(crewCounts).map(([c, n]) => `${c.split(' ')[0]} ${n} stop${n === 1 ? '' : 's'}`).join(' · ')}</p>
          )}
          {!sched.loading && !sched.events.length && !sched.visits.length && !(sched.tasks || []).length && <p className="text-xs text-muted py-1">Nothing on the calendar.</p>}
          {!sched.loading && !sched.calendarsConnected?.length && <p className="text-[11px] text-amber-300 pt-1">Google Calendar isn't connected yet.</p>}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: the day */}
        <div className="space-y-4">
          <Card title="To-do" count={(day.todos || []).filter((x) => !x.done).length}>
            {leftover.length > 0 && (
              <button onClick={() => setDay({ todos: [...(day.todos || []), ...leftover.map((x) => ({ ...x, id: newId(), done: false }))] })}
                className="mb-2 text-xs font-bold text-muted hover:text-primary hover:underline cursor-pointer">+ Bring {leftover.length} unfinished from the day before</button>
            )}
            <Items items={day.todos || []} onToggle={(id, v) => patchItem(id, { done: v })} onEdit={(id, text) => patchItem(id, { text })} onRemove={removeItem} onMove={moveItem} here="today" />
            <AddLine placeholder="Add to this day…" onAdd={(t) => addTo('today', t)} />
          </Card>

          <Card title="Habits" icon={Flame}>
            {data.habits.map((h) => (
              <div key={h.id} className="flex items-center gap-2 py-1 group">
                <Box on={doneHabit(h.id)} onClick={() => toggleHabit(h.id)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-primary">{h.name}</p>
                  {/video|post|tiktok|reel/i.test(h.name) && (() => {
                    // Next video to post: something already filmed, else the newest idea (Social media tab).
                    const next = videoIdeas.find((i) => i.status === 'filmed') || videoIdeas.find((i) => (i.status || 'idea') === 'idea');
                    return (
                      <a href="/social" className="text-[11px] text-muted hover:text-brand">
                        {next ? `Next up: ${next.title}${next.status === 'filmed' ? ' (filmed, ready to post)' : ''}` : 'No video ideas yet. Add some in Social media →'}
                      </a>
                    );
                  })()}
                </div>
                {streak(h.id) > 0 && <span className="text-xs font-black text-muted">🔥 {streak(h.id)}</span>}
                <button onClick={() => save((d) => ({ ...d, habits: d.habits.filter((x) => x.id !== h.id) }))} className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-rose-400 cursor-pointer" title="Remove habit"><Trash2 size={12} /></button>
              </div>
            ))}
            <AddLine placeholder="Add a daily habit…" onAdd={(t) => save((d) => ({ ...d, habits: [...d.habits, { id: newId(), name: t }] }))} />
          </Card>
        </div>

        {/* Right: running lists */}
        <div className="space-y-4">
          <Card title="Goals" icon={Target}>
            <Items items={data.goals} onToggle={(id, v) => patchItem(id, { done: v })} onEdit={(id, text) => patchItem(id, { text })} onRemove={removeItem} here="goals" />
            <AddLine placeholder="Add a goal…" onAdd={(t) => addTo('goals', t)} />
          </Card>
          {LISTS.map((l) => (
            <Card key={l.key} title={l.label} tone={l.tone} count={(data.lists[l.key] || []).filter((x) => !x.done).length}>
              <Items items={data.lists[l.key] || []} onToggle={(id, v) => patchItem(id, { done: v })} onEdit={(id, text) => patchItem(id, { text })} onRemove={removeItem} onMove={moveItem} here={l.key} />
              <AddLine placeholder={l.key === 'brainDump' ? 'Dump anything…' : `Add to ${l.label}…`} onAdd={(t) => addTo(l.key, t)} />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, tone, count, right, children }) {
  return (
    <section className="rounded-2xl sm:rounded-3xl border border-card-border bg-card p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={15} className="text-muted" />}
        <p className={`text-sm font-black flex-1 ${tone || 'text-primary'}`}>{title}</p>
        {count > 0 && <span className="text-xs font-black text-muted">{count}</span>}
        {right}
      </div>
      {children}
    </section>
  );
}

function Box({ on, onClick }) {
  return (
    <button onClick={onClick} className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center cursor-pointer ${on ? 'bg-brand border-brand' : 'border-card-border hover:border-brand'}`}>
      {on && <Check size={12} strokeWidth={3} className="text-black" />}
    </button>
  );
}

const MOVE_TO = [['today', 'Today'], ['cantWait', "Can't wait"], ['implement', 'Implement'], ['canWait', 'Can wait'], ['brainDump', 'Brain dump']];
function Items({ items, onToggle, onEdit, onRemove, onMove, here }) {
  const [editing, setEditing] = useState(null);
  const open = items.filter((x) => !x.done);
  const done = items.filter((x) => x.done);
  const row = (x) => (
    <div key={x.id} className="flex items-start gap-2 py-1 group">
      <span className="pt-0.5"><Box on={x.done} onClick={() => onToggle(x.id, !x.done)} /></span>
      {editing === x.id ? (
        <input autoFocus defaultValue={x.text} onBlur={(e) => { onEdit(x.id, e.target.value.trim() || x.text); setEditing(null); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(null); }}
          className="flex-1 bg-surface-alt rounded-lg px-2 py-0.5 text-sm text-primary outline-none" />
      ) : (
        <p onClick={() => setEditing(x.id)} className={`flex-1 text-sm cursor-text ${x.done ? 'text-tertiary line-through' : 'text-primary'}`}>{x.text}</p>
      )}
      {onMove && (
        <select value="" onChange={(e) => e.target.value && onMove(x.id, e.target.value)} title="Move to…"
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 bg-surface-alt text-[11px] text-muted rounded-lg px-1 py-0.5 cursor-pointer outline-none">
          <option value="">Move…</option>
          {MOVE_TO.filter(([k]) => k !== here).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      )}
      <button onClick={() => onRemove(x.id)} className="opacity-0 group-hover:opacity-100 p-0.5 text-muted hover:text-rose-400 cursor-pointer" title="Delete"><X size={13} /></button>
    </div>
  );
  return (
    <div>
      {open.map(row)}
      {done.length > 0 && <details className="mt-1"><summary className="text-[11px] text-muted cursor-pointer">{done.length} done</summary>{done.map(row)}</details>}
    </div>
  );
}

function AddLine({ placeholder, onAdd }) {
  const [v, setV] = useState('');
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <Plus size={13} className="text-muted shrink-0" />
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onAdd(v); setV(''); } }}
        placeholder={placeholder} className="flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-muted py-1" />
    </div>
  );
}
