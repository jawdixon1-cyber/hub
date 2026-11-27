import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RefreshCw, Check, X, MapPin, Phone, Users, Inbox, Search, Clock, Plus, Trash2, ExternalLink, Map as MapIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const RouteMapInner = lazy(() => import('../components/RouteMapInner'));

// Schedule — straight from Jobber: visits, assessments, tasks, events. Month / Week / Day like Jobber's calendar.
// Everything you change here (drag, complete, assign, create) is written to Jobber right away.
const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 6 AM – 8 PM
const ROW = 48; // px per hour
const SNAP = 15; // minutes
const TYPES = [['Visit', 'Visits'], ['Assessment', 'Assessments'], ['Task', 'Tasks'], ['Event', 'Events']];
const STATUSES = [['all', 'All'], ['open', 'Not done'], ['done', 'Done'], ['overdue', 'Overdue']];
const LIGHTS = /\b(lights?|lighting)\b|christmas|wreath|garland/i;
const colorOf = (i) => {
  if (i.type === 'Assessment' || i.type === 'Request') return '#7C3AED';
  if (i.type === 'Task') return '#4B5563';
  if (i.type === 'Event') return '#6B5D10';
  if (LIGHTS.test(i.title || '')) return '#B91C1C';
  return i.recurring ? '#15803D' : '#1D4ED8';
};
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const weekStart = (d) => { const x = dayOnly(d); x.setDate(x.getDate() - x.getDay()); return x; }; // Sunday, like Jobber
const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const minsOf = (it) => (it.allDay ? 60 : Math.max(15, Math.round((new Date(it.endAt) - new Date(it.startAt)) / 60000) || 60));
const fmt12 = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const LENGTHS = [15, 30, 45, 60, 90, 120, 180, 240, 480];
const lenLabel = (m) => (m < 60 ? `${m} min` : `${m / 60} hr`);

export default function JobberSchedule() {
  const { session } = useAuth();
  const token = session?.access_token || '';
  const navigate = useNavigate();
  const saved = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const [view, setView] = useState(() => saved('sched-view', 'week'));
  const [anchor, setAnchor] = useState(() => new Date());
  const [types, setTypes] = useState(() => new Set(TYPES.map(([t]) => t)));
  const [team, setTeam] = useState(() => new Set()); // empty = everyone
  const [status, setStatus] = useState('all');
  const [lanes, setLanes] = useState(() => saved('sched-lanes', '') === '1'); // Day view: one column per person
  const [showMap, setShowMap] = useState(() => saved('sched-map', '') === '1');
  const [showUnsched, setShowUnsched] = useState(false);
  const [data, setData] = useState(null);
  const [reqs, setReqs] = useState([]); // requests waiting for an assessment date
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [moves, setMoves] = useState({}); // optimistic: id → { startAt, endAt, allDay }
  const [popup, setPopup] = useState(null); // item
  const [create, setCreate] = useState(null); // { date, time, allDay }
  const [finder, setFinder] = useState(false);
  const drag = useRef(null);

  useEffect(() => { try { localStorage.setItem('sched-view', view); localStorage.setItem('sched-lanes', lanes ? '1' : ''); localStorage.setItem('sched-map', showMap ? '1' : ''); } catch { /* ignore */ } }, [view, lanes, showMap]);

  const start = view === 'month' ? weekStart(new Date(anchor.getFullYear(), anchor.getMonth(), 1)) : view === 'week' ? weekStart(anchor) : dayOnly(anchor);
  const days = view === 'month' ? 42 : view === 'week' ? 7 : 1;
  const startStr = ymd(start);
  const auth = { Authorization: `Bearer ${token}` };

  const reqNo = useRef(0); // only the latest load may set data (fast clicking = answers arrive out of order)
  const load = (fresh) => {
    if (!token) return;
    const mine = ++reqNo.current;
    setBusy(true); setErr('');
    fetch(`/api/jobber-today?range=${startStr}&days=${days}${fresh ? '&fresh=1' : ''}`, { headers: auth })
      .then((r) => r.json())
      .then((d) => { if (mine !== reqNo.current) return; if (d.error) setErr(d.error); else { setData(d); setMoves({}); } })
      .catch(() => { if (mine === reqNo.current) setErr('Could not reach Jobber'); })
      .finally(() => { if (mine === reqNo.current) setBusy(false); });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setData(null); load(false); }, [startStr, days, token]);
  useEffect(() => {
    fetch('/api/jobber-data?action=requests-list').then((r) => r.json())
      .then((d) => setReqs((d.requests || []).filter((r) => r.status === 'unscheduled').map((r) => ({ ...r, type: 'Request', title: r.title || 'Request' }))))
      .catch(() => {});
  }, []);

  // Write a change to Jobber, then reload fresh.
  const act = async (body, msg) => {
    setErr(''); setNote('Saving to Jobber…');
    try {
      const r = await fetch('/api/jobber-today?schedule=1', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Jobber said no');
      setNote(msg || 'Saved'); setTimeout(() => setNote(''), 2500);
      load(true);
      return true;
    } catch (e) { setErr(e.message); setNote(''); setMoves({}); return false; }
  };
  const scheduleRequest = async (r, date, time) => {
    setNote('Scheduling assessment…');
    try {
      const x = await fetch('/api/jobber-data?action=request-action', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, op: 'assessment', date, time, minutes: 60 }) });
      const d = await x.json();
      if (!x.ok) throw new Error(d.error || 'Jobber said no');
      setReqs((l) => l.filter((q) => q.id !== r.id));
      setNote('Assessment scheduled'); setTimeout(() => setNote(''), 2500);
      load(true);
    } catch (e) { setErr(e.message); setNote(''); }
  };

  // Move anything to a date (and time, or all day). Shows the new spot right away.
  const moveTo = (it, date, time) => {
    const allDay = !time;
    const minutes = minsOf(it);
    if (it.type === 'Request') return scheduleRequest(it, date, time || '09:00');
    if (it.type === 'Assessment' && allDay) time = it.allDay ? '09:00' : hm(new Date(it.startAt)); // assessments keep a time
    const s = new Date(`${date}T${time || '00:00'}:00`);
    setMoves((m) => ({ ...m, [it.id]: { startAt: s.toISOString(), endAt: new Date(s.getTime() + minutes * 60000).toISOString(), allDay: allDay && it.type !== 'Assessment' } }));
    const op = { Visit: 'visit-move', Task: 'task-move', Assessment: 'assessment-move', Event: 'event-move' }[it.type];
    return act({ op, id: it.id, date, time: time || undefined, allDay: allDay && it.type !== 'Assessment', minutes }, `Moved ${it.client || it.title}`);
  };

  const cols = useMemo(() => Array.from({ length: days }, (_, i) => addDays(start, i)), [startStr, days]); // eslint-disable-line react-hooks/exhaustive-deps
  const [now] = useState(() => Date.now());
  const current = data && data.start === startStr && data.days === days ? data : null;
  const all = useMemo(() => (current?.items || []).map((it) => (moves[it.id] ? { ...it, ...moves[it.id] } : it)), [current, moves]);
  const shown = useMemo(() => all.filter((it) => {
    if (!types.has(it.type)) return false;
    if (team.size) {
      const ids = it.crew.map((c) => c.id);
      if (!(ids.some((id) => team.has(id)) || (!ids.length && team.has('_none')))) return false;
    }
    if (status === 'open' && it.done) return false;
    if (status === 'done' && !it.done) return false;
    if (status === 'overdue' && (it.done || new Date(it.endAt || it.startAt).getTime() > now)) return false;
    return true;
  }), [all, types, team, status, now]);
  const byDay = useMemo(() => {
    const m = {};
    for (const it of shown) {
      const k = ymd(new Date(it.startAt));
      (m[k] ||= { anytime: [], timed: [] })[it.allDay ? 'anytime' : 'timed'].push(it);
    }
    for (const v of Object.values(m)) {
      v.anytime.sort((a, b) => a.type.localeCompare(b.type) || (a.title || '').localeCompare(b.title || ''));
      v.timed.sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    return m;
  }, [shown]);
  const counts = useMemo(() => { const c = {}; for (const it of all) c[it.type] = (c[it.type] || 0) + 1; return c; }, [all]);
  const teamList = useMemo(() => data?.team || [], [data]);
  const unschedCount = (data?.unscheduled?.length || 0) + reqs.length;

  const todayStr = ymd(new Date());
  const title = view === 'day'
    ? start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : (view === 'month' ? anchor : start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const step = (dir) => setAnchor((a) => (view === 'month' ? new Date(a.getFullYear(), a.getMonth() + dir, 1) : addDays(a, dir * days)));

  // ── drag & drop ──
  const dragProps = (it) => ({
    draggable: true,
    onDragStart: (e) => { drag.current = it; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', it.id); } catch { /* ignore */ } },
    onDragEnd: () => { drag.current = null; },
  });
  const allowDrop = (e) => { if (drag.current) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } };
  const dropTimed = (e, date) => {
    e.preventDefault();
    const it = drag.current; drag.current = null;
    if (!it) return;
    const rect = e.currentTarget.getBoundingClientRect();
    let m = Math.round(((e.clientY - rect.top) / ROW * 60) / SNAP) * SNAP + HOURS[0] * 60;
    m = Math.max(HOURS[0] * 60, Math.min(m, (HOURS[HOURS.length - 1] + 1) * 60 - SNAP));
    moveTo(it, ymd(date), `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  };
  const dropAnytime = (e, date) => { e.preventDefault(); const it = drag.current; drag.current = null; if (it) moveTo(it, ymd(date), null); };
  const dropMonth = (e, date) => {
    e.preventDefault();
    const it = drag.current; drag.current = null;
    if (!it) return;
    moveTo(it, ymd(date), it.allDay || !it.startAt ? null : hm(new Date(it.startAt)));
  };
  const clickTimed = (e, date) => {
    if (e.target !== e.currentTarget && !e.target.dataset.slot) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const m = Math.floor(((e.clientY - rect.top) / ROW * 60) / 30) * 30 + HOURS[0] * 60;
    setCreate({ date: ymd(date), time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, allDay: false });
  };

  const Chip = ({ it, compact }) => (
    <button {...dragProps(it)} onClick={(e) => { e.stopPropagation(); setPopup(it); }}
      title={`${it.title}${it.client ? ` · ${it.client}` : ''}${it.crew?.length ? ` · ${it.crew.map((c) => c.name).join(', ')}` : ''}`}
      className={`w-full text-left rounded px-1.5 py-0.5 text-[11px] leading-tight text-white truncate cursor-pointer hover:brightness-125 ${it.done ? 'opacity-55' : ''} ${moves[it.id] ? 'ring-2 ring-white/60' : ''}`}
      style={{ background: colorOf(it) }}>
      {it.done && <Check size={10} className="inline -mt-0.5 mr-0.5" />}
      {!compact && !it.allDay && <span className="opacity-80">{timeOf(it.startAt)} </span>}
      {it.title}
    </button>
  );

  // One timed column (a day, or a day for one person in lanes mode).
  const TimedCol = ({ date, items }) => (
    <div className="relative border-l border-border-subtle" style={{ height: HOURS.length * ROW }}
      onDragEnter={allowDrop} onDragOver={allowDrop} onDrop={(e) => dropTimed(e, date)} onClick={(e) => clickTimed(e, date)}>
      {HOURS.map((h) => <div key={h} data-slot="1" className="border-t border-border-subtle/60 pointer-events-none" style={{ height: ROW }} />)}
      {ymd(date) === todayStr && (() => { const n = new Date(); const top = ((n.getHours() + n.getMinutes() / 60) - HOURS[0]) * ROW; return top > 0 && top < HOURS.length * ROW ? <div className="absolute left-0 right-0 border-t-2 border-red-500 pointer-events-none z-10" style={{ top }} /> : null; })()}
      {layout(items).map(({ it, col, ncol }) => {
        const s = new Date(it.startAt); const e = new Date(it.endAt || it.startAt);
        const top = Math.max(0, ((s.getHours() + s.getMinutes() / 60) - HOURS[0]) * ROW);
        const h = Math.max(20, ((e - s) / 3600000) * ROW);
        return (
          <div key={it.id} className="absolute" style={{ top, height: h, left: `calc(${(col / ncol) * 100}% + 2px)`, width: `calc(${100 / ncol}% - 4px)` }}>
            <button {...dragProps(it)} onClick={(ev) => { ev.stopPropagation(); setPopup(it); }}
              className={`w-full h-full text-left rounded px-1.5 py-0.5 text-[11px] leading-tight text-white overflow-hidden cursor-pointer hover:brightness-125 ${it.done ? 'opacity-55' : ''} ${moves[it.id] ? 'ring-2 ring-white/60' : ''}`} style={{ background: colorOf(it) }}>
              <span className="font-semibold">{it.done && <Check size={10} className="inline -mt-0.5 mr-0.5" />}{timeOf(it.startAt)}</span> {it.title}
              {it.client && (view === 'day' || h > 50) && <span className="block opacity-80 truncate">{it.client}</span>}
            </button>
          </div>
        );
      })}
    </div>
  );

  // Day view lanes: one per person + Unassigned.
  const dayLanes = useMemo(() => {
    if (view !== 'day' || !lanes) return null;
    const ppl = (team.size ? teamList.filter((u) => team.has(u.id)) : teamList).map((u) => ({ key: u.id, label: u.name }));
    return [...ppl, { key: '_none', label: 'Unassigned' }];
  }, [view, lanes, team, teamList]);
  const laneItems = (key, list) => list.filter((it) => (key === '_none' ? !it.crew.length : it.crew.some((c) => c.id === key)));

  const dayStops = view === 'day' ? (byDay[todayKey(start)] ? [...byDay[todayKey(start)].timed, ...byDay[todayKey(start)].anytime] : []) : [];
  const mapStops = dayStops.filter((x) => x.lat && x.lng).map((x, i) => ({ ...x, n: i + 1, job: x.title }));

  return (
    <div className="max-w-[1600px] mx-auto space-y-3">
      {/* Toolbar like Jobber */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => step(-1)} title="Back" className="rounded-lg border border-border-subtle p-2 text-secondary hover:text-primary cursor-pointer"><ChevronLeft size={16} /></button>
        <button onClick={() => step(1)} title="Forward" className="rounded-lg border border-border-subtle p-2 text-secondary hover:text-primary cursor-pointer"><ChevronRight size={16} /></button>
        <button onClick={() => setAnchor(new Date())} className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm font-semibold text-primary cursor-pointer">Today</button>
        <h1 className="text-2xl font-black text-primary mx-1">{title}</h1>
        <div className="flex gap-1 bg-surface-alt rounded-lg p-1">
          {[['month', 'Month'], ['week', 'Week'], ['day', 'Day']].map(([id, l]) => (
            <button key={id} onClick={() => setView(id)} className={`px-3 py-1 rounded-md text-sm font-semibold cursor-pointer ${view === id ? 'bg-card text-primary shadow-sm' : 'text-secondary hover:text-primary'}`}>{l}</button>
          ))}
        </div>
        <button onClick={() => setFinder(true)} className="rounded-lg bg-[#7DC243] px-3 py-1.5 text-sm font-bold text-black cursor-pointer hover:brightness-110"><Search size={14} className="inline -mt-0.5 mr-1" />Find a Time</button>
        <button onClick={() => setCreate({ date: ymd(view === 'day' ? start : new Date()), time: '09:00', allDay: false })} className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm font-semibold text-primary cursor-pointer"><Plus size={14} className="inline -mt-0.5" /> New</button>
        <button onClick={() => setShowUnsched((v) => !v)} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold cursor-pointer ${showUnsched ? 'border-[#7DC243] text-[#7DC243]' : 'border-border-subtle text-primary'}`}>
          <Inbox size={14} className="inline -mt-0.5 mr-1" />Unscheduled {unschedCount ? `(${unschedCount})` : ''}
        </button>
        {view === 'day' && (
          <>
            <button onClick={() => setLanes((v) => !v)} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold cursor-pointer ${lanes ? 'border-[#7DC243] text-[#7DC243]' : 'border-border-subtle text-primary'}`}><Users size={14} className="inline -mt-0.5 mr-1" />By person</button>
            <button onClick={() => setShowMap((v) => !v)} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold cursor-pointer ${showMap ? 'border-[#7DC243] text-[#7DC243]' : 'border-border-subtle text-primary'}`}><MapIcon size={14} className="inline -mt-0.5 mr-1" />Map</button>
          </>
        )}
        <button onClick={() => load(true)} disabled={busy} title="Refresh from Jobber" className="ml-auto rounded-lg border border-border-subtle p-2 text-secondary hover:text-primary cursor-pointer disabled:opacity-50"><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /></button>
      </div>

      {/* Filters like Jobber: one dropdown pill each */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <FilterPill label="Type"
          value={types.size === TYPES.length ? 'All' : types.size === 0 ? 'None' : types.size === 1 ? TYPES.find(([t]) => types.has(t))[1] : `${types.size} types`}
          options={TYPES.map(([t, l]) => ({ id: t, label: l, count: counts[t], dot: colorOf({ type: t, recurring: true }) }))}
          selected={types} multi
          onToggle={(id) => setTypes((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
          onAll={() => setTypes(new Set(TYPES.map(([t]) => t)))} />
        <FilterPill label="Team"
          value={team.size === 0 ? 'All' : team.size === 1 ? ([...teamList, { id: '_none', name: 'Unassigned' }].find((u) => team.has(u.id))?.name || '1 person') : `${team.size} people`}
          options={[...teamList, { id: '_none', name: 'Unassigned' }].map((u) => ({ id: u.id, label: u.name }))}
          selected={team} multi allMeansEmpty
          onToggle={(id) => setTeam((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
          onAll={() => setTeam(new Set())} />
        <FilterPill label="Status"
          value={STATUSES.find(([k]) => k === status)[1]}
          options={STATUSES.map(([k, l]) => ({ id: k, label: l }))}
          selected={new Set([status])}
          onToggle={(id) => setStatus(id)} />
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-tertiary">
        {[['#15803D', 'Maintenance'], ['#1D4ED8', 'One-time'], ['#B91C1C', 'Christmas lights'], ['#7C3AED', 'Assessment'], ['#4B5563', 'Task'], ['#6B5D10', 'Event']].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l}</span>
        ))}
        <span className="ml-auto">Drag to move · click an empty spot to add</span>
      </div>
      {err && <p className="rounded-lg bg-red-500/10 text-red-400 px-3 py-2 text-sm flex justify-between">{err}<button onClick={() => setErr('')} className="cursor-pointer"><X size={14} /></button></p>}
      {note && <p className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-full bg-card border border-border-default px-4 py-2 text-sm text-primary shadow-2xl">{note}</p>}

      <div className="flex gap-3 items-start">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-border-subtle bg-card">
          {view === 'month' ? (
            <div className="min-w-[760px]">
              <div className="grid grid-cols-7 border-b border-border-subtle">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-2 text-center text-xs font-bold text-tertiary">{d}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {cols.map((d) => {
                  const k = ymd(d); const list = [...(byDay[k]?.anytime || []), ...(byDay[k]?.timed || [])];
                  const other = d.getMonth() !== anchor.getMonth();
                  return (
                    <div key={k} onDragEnter={allowDrop} onDragOver={allowDrop} onDrop={(e) => dropMonth(e, d)}
                      onClick={(e) => { if (e.target === e.currentTarget) setCreate({ date: k, time: '09:00', allDay: true }); }}
                      className={`min-h-[112px] border-b border-l border-border-subtle p-1 space-y-0.5 ${other ? 'opacity-45' : ''}`}>
                      <button onClick={() => { setAnchor(d); setView('day'); }} className={`text-xs font-bold px-1.5 rounded cursor-pointer ${k === todayStr ? 'bg-sky-600 text-white' : 'text-primary hover:underline'}`}>{d.getDate()}</button>
                      {list.slice(0, 4).map((it) => <Chip key={it.id} it={it} />)}
                      {list.length > 4 && <button onClick={() => { setAnchor(d); setView('day'); }} className="text-[11px] text-tertiary hover:text-primary cursor-pointer px-1">+{list.length - 4} more</button>}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ minWidth: view === 'week' ? 900 : dayLanes ? 56 + 190 * dayLanes.length : undefined }}>
              {/* headers */}
              <div className="grid border-b border-border-subtle" style={{ gridTemplateColumns: `56px repeat(${dayLanes ? dayLanes.length : days}, minmax(0, 1fr))` }}>
                <div />
                {dayLanes ? dayLanes.map((l) => {
                  const n = laneItems(l.key, [...(byDay[ymd(start)]?.timed || []), ...(byDay[ymd(start)]?.anytime || [])]).length;
                  return <div key={l.key} className="py-2 text-center"><p className="text-sm font-bold text-primary">{l.label}</p><p className="text-[11px] text-tertiary">{n} item{n === 1 ? '' : 's'}</p></div>;
                }) : cols.map((d) => {
                  const k = ymd(d); const isToday = k === todayStr;
                  const n = (byDay[k]?.timed.length || 0) + (byDay[k]?.anytime.length || 0);
                  return (
                    <button key={k} onClick={() => { setAnchor(d); setView('day'); }} className="py-2 text-center cursor-pointer hover:bg-surface-alt">
                      <span className={`inline-block rounded-md px-2 py-0.5 text-sm font-bold ${isToday ? 'bg-sky-600 text-white' : 'text-primary'}`}>{d.getDate()} {d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                      {view === 'day' && <span className="block text-[11px] text-tertiary">{n} item{n === 1 ? '' : 's'}</span>}
                    </button>
                  );
                })}
              </div>
              {/* anytime */}
              <div className="grid border-b-2 border-border-default" style={{ gridTemplateColumns: `56px repeat(${dayLanes ? dayLanes.length : days}, minmax(0, 1fr))` }}>
                <div className="text-[10px] text-tertiary px-1 pt-1.5">Anytime</div>
                {(dayLanes || cols).map((c) => {
                  const d = dayLanes ? start : c; const k = ymd(d);
                  const list = dayLanes ? laneItems(c.key, byDay[k]?.anytime || []) : (byDay[k]?.anytime || []);
                  return (
                    <div key={dayLanes ? c.key : k} onDragEnter={allowDrop} onDragOver={allowDrop} onDrop={(e) => dropAnytime(e, d)}
                      onClick={(e) => { if (e.target === e.currentTarget) setCreate({ date: k, time: '09:00', allDay: true }); }}
                      className="p-1 space-y-0.5 border-l border-border-subtle min-h-[40px]">
                      {list.map((it) => <Chip key={it.id} it={it} compact />)}
                    </div>
                  );
                })}
              </div>
              {/* hours */}
              <div className="grid" style={{ gridTemplateColumns: `56px repeat(${dayLanes ? dayLanes.length : days}, minmax(0, 1fr))` }}>
                <div>{HOURS.map((h) => <div key={h} className="text-[10px] text-tertiary text-right pr-1.5" style={{ height: ROW }}>{h > 12 ? h - 12 : h} {h >= 12 ? 'PM' : 'AM'}</div>)}</div>
                {dayLanes
                  ? dayLanes.map((l) => <TimedCol key={l.key} date={start} items={laneItems(l.key, byDay[ymd(start)]?.timed || [])} />)
                  : cols.map((d) => <TimedCol key={ymd(d)} date={d} items={byDay[ymd(d)]?.timed || []} />)}
              </div>
            </div>
          )}
        </div>

        {/* Right side: unscheduled list and/or day map */}
        {(showUnsched || (view === 'day' && showMap)) && (
          <div className="w-[300px] shrink-0 space-y-3">
            {view === 'day' && showMap && (
              <div className="rounded-xl border border-border-subtle bg-card overflow-hidden" style={{ height: 320 }}>
                {mapStops.length
                  ? <Suspense fallback={<p className="p-4 text-sm text-muted">Loading map…</p>}><RouteMapInner stops={mapStops} /></Suspense>
                  : <p className="p-4 text-sm text-muted">No stops with an address on this day.</p>}
              </div>
            )}
            {showUnsched && (
              <div className="rounded-xl border border-border-subtle bg-card p-3">
                <p className="font-bold text-primary">Unscheduled</p>
                <p className="text-[11px] text-tertiary">Drag onto the calendar to give it a date.</p>
                <div className="mt-2 space-y-1.5 max-h-[60vh] overflow-y-auto">
                  {[...(data?.unscheduled || []), ...reqs].map((it) => (
                    <div key={it.id} {...dragProps(it)} onClick={() => (it.type === 'Request' ? navigate(`/leads?r=${encodeURIComponent(it.id)}`) : setPopup({ ...it, unscheduled: true, crew: [] }))}
                      className="rounded-lg px-2 py-1.5 text-white cursor-grab active:cursor-grabbing" style={{ background: colorOf(it) }}>
                      <p className="text-xs font-semibold truncate">{it.client || it.title}</p>
                      <p className="text-[11px] opacity-80 truncate">{it.type === 'Request' ? `Assessment needed · ${it.title}` : `${it.title}${it.jobNumber ? ` · #${it.jobNumber}` : ''}`}</p>
                    </div>
                  ))}
                  {!unschedCount && <p className="text-xs text-muted">Nothing waiting. 👌</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {!current && !err && <p className="text-sm text-muted">Loading schedule from Jobber…</p>}
      <p className="text-[11px] text-muted">From Jobber{data?.at ? ` · ${new Date(data.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''} · changes save to Jobber right away</p>

      {popup && <ItemPopup it={popup} team={teamList} auth={auth} onClose={() => setPopup(null)} act={act} navigate={navigate} />}
      {create && <CreateDialog init={create} team={teamList} onClose={() => setCreate(null)} act={act} />}
      {finder && <FindTime team={teamList} auth={auth} onClose={() => setFinder(false)} onPick={(slot) => { setFinder(false); setCreate({ ...slot, allDay: false }); }} />}
    </div>
  );
}

// Jobber-style filter: a pill "Label | Value" that opens a checklist.
function FilterPill({ label, value, options, selected, multi, allMeansEmpty, onToggle, onAll }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const active = value !== 'All';
  const allOn = allMeansEmpty ? selected.size === 0 : selected.size === options.length;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-semibold cursor-pointer ${active ? 'border-[#7DC243] bg-[#7DC243]/15 text-primary' : 'border-border-default bg-surface-alt text-primary'}`}>
        {label}<span className="h-3.5 w-px bg-border-strong" /><span className={active ? 'text-[#7DC243]' : 'text-secondary'}>{value}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-56 rounded-xl border border-border-default bg-card shadow-2xl py-1.5">
          {multi && (
            <button onClick={onAll} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-primary hover:bg-surface-alt cursor-pointer">
              <span className={`w-4 h-4 rounded border flex items-center justify-center ${allOn ? 'bg-[#7DC243] border-[#7DC243]' : 'border-border-strong'}`}>{allOn && <Check size={12} className="text-black" />}</span>
              {allMeansEmpty ? 'Everyone' : 'All'}
            </button>
          )}
          {multi && <div className="my-1 border-t border-border-subtle" />}
          {options.map((o) => {
            const on = allMeansEmpty ? selected.has(o.id) : selected.has(o.id);
            return (
              <button key={o.id} onClick={() => { onToggle(o.id); if (!multi) setOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-primary hover:bg-surface-alt cursor-pointer">
                {multi
                  ? <span className={`w-4 h-4 rounded border flex items-center justify-center ${on ? 'bg-[#7DC243] border-[#7DC243]' : 'border-border-strong'}`}>{on && <Check size={12} className="text-black" />}</span>
                  : <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${on ? 'border-[#7DC243]' : 'border-border-strong'}`}>{on && <span className="w-2 h-2 rounded-full bg-[#7DC243]" />}</span>}
                {o.dot && <span className="w-2 h-2 rounded-full" style={{ background: o.dot }} />}
                <span className="flex-1 text-left">{o.label}</span>
                {o.count != null && <span className="text-xs text-tertiary">{o.count}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function todayKey(d) { return ymd(d); }

// Side-by-side columns for overlapping timed items.
function layout(items) {
  const out = []; let group = []; let groupEnd = 0;
  const flush = () => { const ncol = Math.max(1, ...group.map((g) => g.col + 1)); group.forEach((g) => out.push({ ...g, ncol })); group = []; };
  for (const it of items) {
    const s = new Date(it.startAt).getTime(); const e = Math.max(new Date(it.endAt || it.startAt).getTime(), s + 20 * 60000);
    if (group.length && s >= groupEnd) flush();
    const used = new Set(group.filter((g) => g.end > s).map((g) => g.col));
    let col = 0; while (used.has(col)) col++;
    group.push({ it, col, end: e }); groupEnd = Math.max(groupEnd, e);
  }
  flush();
  return out;
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className={`w-full ${wide ? 'max-w-xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto rounded-2xl border border-border-default bg-card p-5 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-lg font-black text-primary">{title}</p>
          <button onClick={onClose} className="text-muted hover:text-primary cursor-pointer"><X size={18} /></button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

const field = 'mt-1 w-full rounded-lg border border-border-subtle bg-surface-alt px-2.5 py-1.5 text-sm text-primary';

function WhenFields({ v, set, allowAllDay = true }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <label className="text-xs text-tertiary col-span-3 sm:col-span-1">Date<input type="date" value={v.date} onChange={(e) => set({ ...v, date: e.target.value })} className={field} /></label>
      <label className="text-xs text-tertiary">Start<input type="time" value={v.time} disabled={v.allDay} onChange={(e) => set({ ...v, time: e.target.value })} className={`${field} disabled:opacity-40`} /></label>
      <label className="text-xs text-tertiary">Length<select value={v.minutes} disabled={v.allDay} onChange={(e) => set({ ...v, minutes: Number(e.target.value) })} className={`${field} disabled:opacity-40`}>{LENGTHS.map((m) => <option key={m} value={m}>{lenLabel(m)}</option>)}</select></label>
      {allowAllDay && <label className="col-span-3 flex items-center gap-2 text-sm text-secondary"><input type="checkbox" checked={!!v.allDay} onChange={(e) => set({ ...v, allDay: e.target.checked })} /> Anytime that day</label>}
    </div>
  );
}

// Click on anything: details + the actions Jobber allows for that kind.
function ItemPopup({ it, team, auth, onClose, act, navigate }) {
  const [more, setMore] = useState(null);
  const [when, setWhen] = useState(() => ({
    date: it.startAt ? ymd(new Date(it.startAt)) : ymd(new Date()),
    time: it.startAt && !it.allDay ? hm(new Date(it.startAt)) : '09:00',
    minutes: it.startAt ? minsOf(it) : 60,
    allDay: it.startAt ? !!it.allDay : true,
  }));
  const [crew, setCrew] = useState(() => new Set((it.crew || []).map((c) => c.id)));
  const [confirmDel, setConfirmDel] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (it.type !== 'Visit') return;
    fetch(`/api/jobber-today?visit=${encodeURIComponent(it.id)}`, { headers: auth }).then((r) => r.json()).then((d) => !d.error && setMore(d)).catch(() => {});
  }, [it.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async (body, msg) => { setSaving(true); const ok = await act(body, msg); setSaving(false); if (ok) onClose(); };
  const crewChanged = [...crew].sort().join() !== (it.crew || []).map((c) => c.id).sort().join();
  const isVisit = it.type === 'Visit';
  const canMove = true;
  const moveOp = { Visit: 'visit-move', Task: 'task-move', Assessment: 'assessment-move', Event: 'event-move' }[it.type];
  return (
    <Modal title={it.title} onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full px-2 py-0.5 font-bold text-white" style={{ background: colorOf(it) }}>{it.type === 'Visit' ? (it.recurring ? 'Maintenance visit' : 'Visit') : it.type}</span>
        {it.done && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-400">✓ Done</span>}
        {it.unscheduled && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-bold text-amber-400">Unscheduled</span>}
        {it.jobNumber && <span className="text-tertiary">Job #{it.jobNumber}</span>}
      </div>
      <div className="mt-3 space-y-1.5 text-sm">
        {it.client && <p className="font-bold text-primary">{it.client}</p>}
        {it.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(it.address)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-secondary hover:text-primary"><MapPin size={14} />{it.address}</a>}
        {more?.phone && <a href={`tel:${more.phone}`} className="flex items-center gap-1.5 text-brand"><Phone size={14} />{more.phone}</a>}
        {it.startAt && <p className="flex items-center gap-1.5 text-secondary"><Clock size={14} />{new Date(it.startAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}{it.allDay ? ' · anytime' : ` · ${timeOf(it.startAt)} – ${timeOf(it.endAt)}`}</p>}
        {!!it.crew?.length && <p className="flex items-center gap-1.5 text-secondary"><Users size={14} />{it.crew.map((c) => c.name).join(', ')}</p>}
      </div>
      {more && (
        <div className="mt-3 rounded-lg bg-surface-alt p-3 text-sm space-y-2">
          {more.instructions && <p className="text-secondary whitespace-pre-wrap text-xs">{more.instructions}</p>}
          {!!more.lineItems.length && (
            <div className="text-xs">
              {more.lineItems.map((l, i) => <p key={i} className="flex justify-between text-secondary"><span>{l.qty > 1 ? `${l.qty} × ` : ''}{l.name}</span><span>${Number(l.total || 0).toLocaleString()}</span></p>)}
            </div>
          )}
          {more.job && <p className="text-xs text-tertiary">Job #{more.job.number} · {more.job.title} · ${Number(more.job.total || 0).toLocaleString()}</p>}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {isVisit && !it.unscheduled && <button disabled={saving} onClick={() => go({ op: it.done ? 'visit-uncomplete' : 'visit-complete', id: it.id }, it.done ? 'Marked not done' : 'Marked done ✓')} className="rounded-lg bg-[#7DC243] px-3 py-1.5 text-sm font-bold text-black cursor-pointer disabled:opacity-50">{it.done ? 'Mark not done' : 'Mark done'}</button>}
        {it.type === 'Assessment' && <button disabled={saving} onClick={() => go({ op: it.done ? 'assessment-uncomplete' : 'assessment-complete', id: it.id }, it.done ? 'Marked not done' : 'Marked done ✓')} className="rounded-lg bg-[#7DC243] px-3 py-1.5 text-sm font-bold text-black cursor-pointer disabled:opacity-50">{it.done ? 'Mark not done' : 'Mark done'}</button>}
        {it.type === 'Assessment' && it.requestId && <button onClick={() => navigate(`/leads?r=${encodeURIComponent(it.requestId)}`)} className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm font-semibold text-primary cursor-pointer">Open request</button>}
        {it.url && <a href={it.url} target="_blank" rel="noreferrer" className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm font-semibold text-primary inline-flex items-center gap-1">Open in Jobber <ExternalLink size={12} /></a>}
        {it.type === 'Task' && (confirmDel
          ? <span className="flex items-center gap-2 text-sm"><span className="text-red-400">Delete this task in Jobber?</span><button disabled={saving} onClick={() => go({ op: 'task-delete', id: it.id }, 'Task deleted')} className="rounded-lg bg-red-600 px-3 py-1.5 font-bold text-white cursor-pointer">Delete</button><button onClick={() => setConfirmDel(false)} className="text-secondary cursor-pointer">Cancel</button></span>
          : <button onClick={() => setConfirmDel(true)} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-sm font-semibold text-red-400 cursor-pointer"><Trash2 size={13} className="inline -mt-0.5" /> Delete</button>)}
      </div>

      {canMove && (
        <div className="mt-4 border-t border-border-subtle pt-3">
          <p className="text-sm font-bold text-primary mb-2">{it.unscheduled ? 'Schedule it' : 'Reschedule'}</p>
          <WhenFields v={when} set={setWhen} allowAllDay={it.type !== 'Assessment'} />
          <button disabled={saving} onClick={() => go({ op: moveOp, id: it.id, date: when.date, time: when.allDay ? undefined : when.time, allDay: when.allDay, minutes: when.minutes }, 'Rescheduled')} className="mt-2 rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white cursor-pointer disabled:opacity-50">{saving ? 'Saving…' : 'Save time'}</button>
        </div>
      )}
      {isVisit && (
        <div className="mt-4 border-t border-border-subtle pt-3">
          <p className="text-sm font-bold text-primary mb-2">Crew</p>
          <div className="flex flex-wrap gap-1.5">
            {team.map((u) => (
              <button key={u.id} onClick={() => setCrew((s) => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })}
                className={`rounded-full border px-3 py-1 text-sm font-semibold cursor-pointer ${crew.has(u.id) ? 'border-[#7DC243] bg-[#7DC243]/15 text-primary' : 'border-border-subtle text-secondary'}`}>{u.name}</button>
            ))}
          </div>
          {crewChanged && <button disabled={saving} onClick={() => go({ op: 'visit-assign', id: it.id, userIds: [...crew] }, 'Crew updated')} className="mt-2 rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white cursor-pointer disabled:opacity-50">Save crew</button>}
        </div>
      )}
      {it.type === 'Event' && <p className="mt-4 text-xs text-muted">Jobber doesn’t let apps delete events — delete this one in Jobber.</p>}
    </Modal>
  );
}

// New task / event / visit (for an existing job).
function CreateDialog({ init, team, onClose, act }) {
  const [kind, setKind] = useState('Task');
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState({ date: init.date, time: init.time || '09:00', minutes: 60, allDay: !!init.allDay });
  const [who, setWho] = useState('');
  const [jobs, setJobs] = useState(null);
  const [q, setQ] = useState('');
  const [job, setJob] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (kind !== 'Visit' || jobs) return;
    fetch('/api/jobber-data?action=plans').then((r) => r.json())
      .then((d) => setJobs((d.clients || []).flatMap((c) => c.jobs.filter((j) => j.active).map((j) => ({ ...j, client: c.name })))))
      .catch(() => setJobs([]));
  }, [kind, jobs]);
  const found = (jobs || []).filter((j) => !q.trim() || `${j.client} ${j.title} ${j.jobNumber}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);
  const save = async () => {
    setSaving(true);
    const t = when.allDay ? undefined : when.time;
    const ok = kind === 'Visit'
      ? await act({ op: 'visit-create', jobId: job?.id, title: title || undefined, date: when.date, time: t, allDay: when.allDay, minutes: when.minutes }, 'Visit added')
      : await act({ op: kind === 'Task' ? 'task-create' : 'event-create', title, date: when.date, time: t, allDay: when.allDay, minutes: when.minutes, assignedTo: kind === 'Task' && who ? who : undefined }, `${kind} added`);
    setSaving(false);
    if (ok) onClose();
  };
  const ready = kind === 'Visit' ? !!job : !!title.trim();
  return (
    <Modal title="Add to the schedule" onClose={onClose}>
      <div className="flex gap-1 bg-surface-alt rounded-lg p-1 mb-3">
        {['Task', 'Event', 'Visit'].map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`flex-1 px-3 py-1 rounded-md text-sm font-semibold cursor-pointer ${kind === k ? 'bg-card text-primary shadow-sm' : 'text-secondary'}`}>{k === 'Visit' ? 'Visit for a job' : k}</button>
        ))}
      </div>
      {kind === 'Visit' && (
        <div className="mb-3">
          {job ? (
            <p className="rounded-lg bg-surface-alt px-3 py-2 text-sm text-primary flex justify-between">#{job.jobNumber} · {job.client} · {job.title}<button onClick={() => setJob(null)} className="text-muted cursor-pointer"><X size={14} /></button></p>
          ) : (
            <>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a client or job…" className={field} />
              <div className="mt-1 max-h-48 overflow-y-auto">
                {!jobs && <p className="text-xs text-muted p-2">Loading jobs…</p>}
                {found.map((j) => <button key={j.id} onClick={() => setJob(j)} className="block w-full text-left rounded px-2 py-1.5 text-sm text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer">#{j.jobNumber} · <b className="text-primary">{j.client}</b> · {j.title || 'Job'}</button>)}
              </div>
            </>
          )}
        </div>
      )}
      <label className="text-xs text-tertiary">{kind === 'Visit' ? 'Title (optional)' : 'Title'}<input autoFocus={kind !== 'Visit'} value={title} onChange={(e) => setTitle(e.target.value)} className={field} /></label>
      <div className="mt-2"><WhenFields v={when} set={setWhen} /></div>
      {kind === 'Task' && (
        <label className="mt-2 block text-xs text-tertiary">Assign to<select value={who} onChange={(e) => setWho(e.target.value)} className={field}><option value="">Nobody</option>{team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      )}
      {kind === 'Event' && <p className="mt-2 text-[11px] text-muted">Heads up: you can move events from Hub, but deleting one has to be done in Jobber.</p>}
      <button disabled={!ready || saving} onClick={save} className="mt-4 w-full rounded-lg bg-[#7DC243] py-2 text-sm font-bold text-black cursor-pointer disabled:opacity-40">{saving ? 'Adding to Jobber…' : `Add ${kind.toLowerCase()}`}</button>
    </Modal>
  );
}

// Find a Time: open slots in the next 2 weeks for a person (8 AM – 5 PM, Mon–Sat), based on their timed items.
function FindTime({ team, auth, onClose, onPick }) {
  const [who, setWho] = useState(team[0]?.id || '');
  const [minutes, setMinutes] = useState(60);
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch(`/api/jobber-today?range=${ymd(new Date())}&days=14`, { headers: auth }).then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setItems(d.items || []))).catch(() => setErr('Could not reach Jobber'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [nowMs] = useState(() => Date.now());
  const slots = useMemo(() => {
    if (!items) return [];
    const mine = items.filter((it) => !it.done && it.crew.some((c) => c.id === who));
    const out = [];
    for (let i = 0; i < 14 && out.length < 12; i++) {
      const d = addDays(dayOnly(new Date()), i);
      if (d.getDay() === 0) continue;
      const k = ymd(d);
      const busy = mine.filter((it) => !it.allDay && ymd(new Date(it.startAt)) === k).map((it) => [new Date(it.startAt).getTime(), new Date(it.endAt).getTime()]).sort((a, b) => a[0] - b[0]);
      const anytime = mine.filter((it) => it.allDay && ymd(new Date(it.startAt)) === k).length;
      let t = new Date(`${k}T08:00:00`).getTime();
      const endDay = new Date(`${k}T17:00:00`).getTime();
      if (t < nowMs) t = Math.ceil(nowMs / (30 * 60000)) * 30 * 60000;
      for (const [s, e] of [...busy, [endDay, endDay]]) {
        if (s - t >= minutes * 60000 && t + minutes * 60000 <= endDay) { out.push({ date: k, time: hm(new Date(t)), anytime, day: d }); break; }
        t = Math.max(t, e);
      }
    }
    return out;
  }, [items, who, minutes, nowMs]);
  return (
    <Modal title="Find a Time" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-tertiary">Who<select value={who} onChange={(e) => setWho(e.target.value)} className={field}>{team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label className="text-xs text-tertiary">How long<select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={field}>{LENGTHS.filter((m) => m >= 30).map((m) => <option key={m} value={m}>{lenLabel(m)}</option>)}</select></label>
      </div>
      <p className="mt-2 text-[11px] text-muted">First open spot each day, 8 AM–5 PM, Mon–Sat, next 2 weeks. “Anytime” jobs that day are listed but don’t block a time.</p>
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      {!items && !err && <p className="mt-3 text-sm text-muted">Checking the schedule…</p>}
      <div className="mt-3 space-y-1.5">
        {slots.map((s) => (
          <button key={s.date} onClick={() => onPick({ date: s.date, time: s.time })} className="w-full flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2 text-sm hover:bg-surface-alt cursor-pointer">
            <span className="font-semibold text-primary">{s.day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {fmt12(s.time)}</span>
            <span className="text-xs text-tertiary">{s.anytime ? `${s.anytime} anytime job${s.anytime === 1 ? '' : 's'}` : 'open day'}</span>
          </button>
        ))}
        {items && !slots.length && <p className="text-sm text-muted">No open spots that long in the next 2 weeks.</p>}
      </div>
    </Modal>
  );
}
