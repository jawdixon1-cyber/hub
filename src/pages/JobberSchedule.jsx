import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Palette, ArrowUp, ListOrdered, ChevronLeft, ChevronRight, RefreshCw, Check, X, MapPin, Phone, Users, Inbox, Search, Clock, Plus, Trash2, ExternalLink, Map as MapIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';

const NO_ORDER = {};

const ScheduleMap = lazy(() => import('../components/ScheduleMap'));

// Schedule — straight from Jobber: visits, assessments, tasks, events. Month / Week / Day like Jobber's calendar.
// Everything you change here (drag, complete, assign, create) is written to Jobber right away.
const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 6 AM – 8 PM
const ROW = 48; // px per hour
const SNAP = 15; // minutes
const TYPES = [['Visit', 'Visits'], ['Assessment', 'Assessments'], ['Task', 'Tasks'], ['Event', 'Events']];
const STATUSES = [['all', 'All'], ['open', 'Not done'], ['done', 'Done'], ['overdue', 'Overdue']];
// Color rules (like Jobber's schedule settings): words in a visit's title pick its color, first match wins.
// Types without a matching word use their type color. Saved in Hub and synced across devices.
const DEFAULT_COLORS = {
  types: { Visit: '#2B6A1E', Assessment: '#D9690F', Task: '#4F5B66', Event: '#6B5D10' },
  rules: [
    { id: 'lights', words: 'christmas, lights', color: '#A3201B' },
    { id: 'landscaping', words: 'landscaping', color: '#164A33' },
  ],
};
const SWATCHES = ['#2B6A1E', '#164A33', '#65A30D', '#1D4ED8', '#0E7490', '#7C3AED', '#BE185D', '#A3201B', '#D9690F', '#CA8A04', '#6B5D10', '#4F5B66'];
let COLORS = DEFAULT_COLORS; // set from the store each render
const wordsOf = (r) => String(r.words || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
const colorOf = (i) => {
  const t = i.type === 'Request' ? 'Assessment' : i.type;
  if (t === 'Visit') {
    const title = String(i.title || '').toLowerCase();
    const hit = (COLORS.rules || []).find((r) => wordsOf(r).some((w) => title.includes(w)));
    if (hit) return hit.color;
  }
  return COLORS.types?.[t] || DEFAULT_COLORS.types[t] || '#4B5563';
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
  const showUnsched = false; // unscheduled panel removed from the toolbar (Jude doesn't use it)
  const [data, setData] = useState(null);
  const [reqs, setReqs] = useState([]); // requests waiting for an assessment date
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [moves, setMoves] = useState({}); // optimistic: id → { startAt, endAt, allDay }
  const [popup, setPopup] = useState(null); // item
  const [create, setCreate] = useState(null); // { date, time, allDay }
  const [finder, setFinder] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [route, setRoute] = useState(() => saved('sched-route', '1') === '1'); // route mode: numbered stops, drag to reorder, line on map
  useEffect(() => { try { localStorage.setItem('sched-route', route ? '1' : '0'); } catch { /* ignore */ } }, [route]);
  const [hoverId, setHoverId] = useState(null); // list ⇄ map hover link
  const [mapBig, setMapBig] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const [optOpen, setOptOpen] = useState(false); // route optimization popover
  const [anyCollapsed, setAnyCollapsed] = useState(false);
  const [dragId, setDragId] = useState(null); // item being dragged (shown faded)
  const [dropAt, setDropAt] = useState(null); // { day, before } where a reordered stop will land (green line)
  const drag = useRef(null);
  // Route order for anytime stops, saved in Hub (synced across devices). Jobber's API can't change its own order.
  const routeOrder = useAppStore((st) => st.routeOrder) || NO_ORDER;
  const setRouteOrder = useAppStore((st) => st.setRouteOrder);
  const schedColors = useAppStore((st) => st.schedColors);
  const setSchedColors = useAppStore((st) => st.setSchedColors);
  COLORS = schedColors || DEFAULT_COLORS;
  // Route home base (Schedule settings → Route): a custom address, else the business address from Settings.
  const business = useAppStore((st) => st.businessSettings) || {};
  const home = useMemo(() => {
    const h = COLORS.home;
    if (h?.lat && h?.lng) return h;
    if (business.lat && business.lon) return { address: [business.street, business.city].filter(Boolean).join(', '), lat: Number(business.lat), lng: Number(business.lon), fromBusiness: true };
    return null;
  }, [schedColors, business.lat, business.lon, business.street, business.city]); // eslint-disable-line react-hooks/exhaustive-deps
  const homeStart = home && !!COLORS.homeStart;
  const homeEnd = home && !!COLORS.homeEnd;
  const [colorsOpen, setColorsOpen] = useState(false);

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
    // Dropped where it already is → nothing to save.
    if (it.startAt && ymd(new Date(it.startAt)) === date && (it.allDay ? allDay : !allDay && hm(new Date(it.startAt)) === time)) return undefined;
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
    if (team.size && !(it.type === 'Event' && !it.crew.length)) { // unassigned events are for everyone
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
      const ord = routeOrder[ymd(new Date((v.anytime[0] || {}).startAt || 0))] || [];
      if (ord.length) { const pos = (it) => { const i = ord.indexOf(it.id); return i < 0 ? 1e6 : i; }; v.anytime.sort((a, b) => pos(a) - pos(b)); }
      v.timed.sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    return m;
  }, [shown, routeOrder]);
  const counts = useMemo(() => { const c = {}; for (const it of all) c[it.type] = (c[it.type] || 0) + 1; return c; }, [all]);
  const teamList = useMemo(() => data?.team || [], [data]);
  const unschedCount = (data?.unscheduled?.length || 0) + reqs.length;

  const todayStr = ymd(new Date());
  const title = (view === 'month' ? anchor : start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const step = (dir) => setAnchor((a) => (view === 'month' ? new Date(a.getFullYear(), a.getMonth() + dir, 1) : addDays(a, dir * days)));

  // ── drag & drop ──
  const dragProps = (it) => ({
    draggable: true,
    onDragStart: (e) => { drag.current = it; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', it.id); } catch { /* ignore */ } setTimeout(() => setDragId(it.id), 0); },
    onDragEnd: () => { drag.current = null; setDragId(null); setDropAt(null); },
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
  // Put `it` right before `before` (or at the end) in that day's stop order. Hub only — nothing sent to Jobber.
  const reorder = (it, date, before) => {
    const k = ymd(date);
    const cur = (byDay[k]?.anytime || []).map((x) => x.id).filter((id) => id !== it.id);
    const at = before ? cur.indexOf(before.id) : -1;
    cur.splice(at < 0 ? cur.length : at, 0, it.id);
    setRouteOrder((all) => ({ ...(all || {}), [k]: cur }));
    setDropAt(null); setDragId(null);
  };
  const sameDayAnytime = (it, date) => it.allDay && it.startAt && ymd(new Date(it.startAt)) === ymd(date);
  const dropAnytime = (e, date) => {
    e.preventDefault();
    const it = drag.current; drag.current = null;
    if (!it) return;
    if (sameDayAnytime(it, date)) { if (route) reorder(it, date, null); return; } // same day: reorder (route on) or nothing
    else moveTo(it, ymd(date), null);
  };
  const dropOnChip = (e, target) => {
    const it = drag.current;
    if (!it || !target.allDay || it.id === target.id) return;
    const date = new Date(target.startAt);
    if (!sameDayAnytime(it, date)) return; // let the column handle moves between days
    if (!route) { e.preventDefault(); e.stopPropagation(); drag.current = null; return; }
    e.preventDefault(); e.stopPropagation(); drag.current = null;
    reorder(it, date, target);
  };
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

  const initials = (it) => (it.crew || []).slice(0, 3).map((c) => { const p = String(c.name || '?').trim().split(/\s+/); return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); });
  const avatar = (c, i) => <span key={i} className="inline-flex shrink-0 align-[-3px] w-[17px] h-[17px] rounded-full bg-[#E8EBEE] ring-1 ring-black/30 text-[8px] font-bold text-[#3A4550] items-center justify-center mr-[2px]">{c}</span>;
  const markDrop = (day, before) => setDropAt((d) => (d && d.day === day && d.before === before ? d : { day, before }));
  const dropLine = <div className="h-0.5 rounded-full bg-[#7DC243] my-0.5" />;
  // One schedule bar (anytime row or month cell). Plain function, not a component, so dragging doesn't remount it.
  const chip = (it, compact, n, wrap) => {
    const k = it.startAt ? ymd(new Date(it.startAt)) : '';
    return (
      <div key={it.id}>
        {compact && dropAt && dropAt.day === k && dropAt.before === it.id && dragId !== it.id && dropLine}
        <button data-chip="1" {...dragProps(it)} onClick={(e) => { e.stopPropagation(); setPopup({ ...it, _rect: e.currentTarget.getBoundingClientRect() }); }}
          onMouseEnter={() => setHoverId(it.id)} onMouseLeave={() => setHoverId(null)}
          onDragOver={compact ? (e) => { if (drag.current && sameDayAnytime(drag.current, new Date(it.startAt))) { e.preventDefault(); e.stopPropagation(); if (route) markDrop(k, it.id); } } : undefined}
          onDrop={compact ? (e) => dropOnChip(e, it) : undefined}
          title={`${it.title}${it.client ? ` · ${it.client}` : ''}${it.crew?.length ? ` · ${it.crew.map((c) => c.name).join(', ')}` : ''}`}
          className={`block w-full min-w-0 text-left rounded-md text-white cursor-pointer hover:brightness-125 transition-opacity ${wrap ? 'px-1.5 py-1 text-[12px] leading-[17px] break-words' : 'px-1.5 py-[3px] text-[12px] leading-[17px] truncate'} ${dragId === it.id ? 'opacity-30' : ''} ${moves[it.id] || hoverId === it.id || popup?.id === it.id ? 'ring-2 ring-white/80' : ''}`}
          style={{ background: colorOf(it) }}>
          {n != null && <span className="font-bold opacity-80 mr-1">{n}.</span>}
          {(wrap || (compact && view !== 'month')) && initials(it).map(avatar)}
          {!compact && !it.allDay && <span className={`whitespace-nowrap opacity-85 mr-1 ${it.done ? 'line-through' : ''}`}>{timeOf(it.startAt)}</span>}
          <span className={it.done ? 'line-through decoration-[1.5px]' : ''}>{it.title}</span>
        </button>
      </div>
    );
  };

  // One timed column (a day, or a day for one person in lanes mode).
  const timedCol = (date, items, key) => (
    <div key={key} className="relative border-l border-border-subtle" style={{ height: HOURS.length * ROW }}
      onDragEnter={allowDrop} onDragOver={allowDrop} onDrop={(e) => dropTimed(e, date)} onClick={(e) => clickTimed(e, date)}>
      {HOURS.map((h) => <div key={h} data-slot="1" className="border-t border-border-subtle/60 pointer-events-none" style={{ height: ROW }} />)}
      {ymd(date) === todayStr && (() => { const n = new Date(); const top = ((n.getHours() + n.getMinutes() / 60) - HOURS[0]) * ROW; return top > 0 && top < HOURS.length * ROW ? <div className="absolute left-0 right-0 border-t-2 border-red-500 pointer-events-none z-10" style={{ top }} /> : null; })()}
      {layout(items).map(({ it, col, ncol }) => {
        const s = new Date(it.startAt); const e = new Date(it.endAt || it.startAt);
        const top = Math.max(0, ((s.getHours() + s.getMinutes() / 60) - HOURS[0]) * ROW);
        const h = Math.max(20, ((e - s) / 3600000) * ROW);
        return (
          <div key={it.id} className="absolute" style={{ top, height: h, left: `calc(${(col / ncol) * 100}% + 2px)`, width: `calc(${100 / ncol}% - 4px)` }}>
            <button data-chip="1" {...dragProps(it)} onClick={(ev) => { ev.stopPropagation(); setPopup({ ...it, _rect: ev.currentTarget.getBoundingClientRect() }); }}
              onMouseEnter={() => setHoverId(it.id)} onMouseLeave={() => setHoverId(null)}
              className={`w-full h-full text-left rounded px-1.5 py-0.5 text-[11px] leading-tight text-white overflow-hidden cursor-pointer hover:brightness-125 ${dragId === it.id ? 'opacity-30' : ''} ${moves[it.id] ? 'ring-2 ring-white/60' : ''}`} style={{ background: colorOf(it) }}>
              {initials(it).map(avatar)}<span className={`whitespace-nowrap font-semibold mr-1 ${it.done ? 'line-through' : ''}`}>{timeOf(it.startAt)}</span><span className={it.done ? 'line-through' : ''}>{it.title}</span>
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
  const laneItems = (key, list) => list.filter((it) => (it.type === 'Event' && !it.crew.length ? true : key === '_none' ? !it.crew.length : it.crew.some((c) => c.id === key)));

  const dayStops = view === 'day' ? (byDay[todayKey(start)] ? [...byDay[todayKey(start)].anytime, ...byDay[todayKey(start)].timed] : []) : [];
  const mapStops = dayStops.map((x, i) => ({ ...x, n: route ? i + 1 : '', color: colorOf(x) })).filter((x) => x.lat && x.lng);
  const pinLabel = (x) => `${(x.crew || []).map((c) => c.name).join(', ') || 'Unassigned'} · ${new Date(x.startAt).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })} ${x.allDay ? 'Anytime' : timeOf(x.startAt)}`;
  // Route optimization (Hub-only order). Uses real road drive times (OSRM: roads, bridges, rivers);
  // falls back to straight-line nearest-neighbor + 2-opt if the road service can't be reached.
  const optimize = async (keepFirst, keepLast, atShopStart, atShopEnd) => {
    setSchedColors({ ...(schedColors || DEFAULT_COLORS), homeStart: !!atShopStart, homeEnd: !!atShopEnd });
    const k = ymd(start);
    const list = byDay[k]?.anytime || [];
    const geo = list.filter((x) => x.lat && x.lng);
    const noGeo = list.filter((x) => !(x.lat && x.lng)).map((x) => x.id);
    if (geo.length < 2) { setOptOpen(false); return; }
    setOptOpen(false); setNote('Optimizing by road…');
    const H = home ? { id: '_home', lat: home.lat, lng: home.lng } : null;
    const first = keepFirst ? geo[0] : null; const last = keepLast ? geo[geo.length - 1] : null;
    const mid = geo.filter((x) => x !== first && x !== last);
    const startPt = atShopStart && H ? H : first; // fixed start (shop or first stop)
    const endPt = atShopEnd && H ? H : last; // fixed end
    let path = null;
    try {
      const pts = [...(startPt ? [startPt] : []), ...(first && startPt !== first ? [first] : []), ...mid, ...(last && endPt !== last ? [last] : []), ...(endPt && endPt !== startPt ? [endPt] : [])];
      const sameEnds = startPt && endPt && startPt === endPt; // shop → … → shop
      const roundtrip = !startPt || !endPt || sameEnds;
      const qs = roundtrip ? `roundtrip=true${startPt ? '&source=first' : ''}` : 'roundtrip=false&source=first&destination=last';
      const coords = pts.map((p) => `${p.lng},${p.lat}`).join(';');
      const r = await fetch(`https://router.project-osrm.org/trip/v1/driving/${coords}?${qs}&overview=false`);
      const d = await r.json();
      if (d.code !== 'Ok') throw new Error(d.code);
      let order = pts.map((p, i) => ({ p, at: d.waypoints[i].waypoint_index })).sort((a, b) => a.at - b.at).map((x) => x.p);
      const legs = d.trips[0].legs.map((l) => l.duration);
      if (roundtrip && !sameEnds && order.length > 2) {
        // Open route: cut the loop at its longest leg (keeping a fixed start/end in place).
        let cut = legs.indexOf(Math.max(...legs));
        if (startPt) cut = order.length - 1; // loop returns to start: drop the leg back home
        order = [...order.slice(cut + 1), ...order.slice(0, cut + 1)];
        if (startPt && order[0] !== startPt) order = [startPt, ...order.filter((x) => x !== startPt)];
        if (endPt && !startPt) order = [...order.filter((x) => x !== endPt), endPt];
      }
      path = order;
    } catch {
      const dist = (a, b) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180));
      let rest = [...mid]; let cur = startPt || rest.shift(); const out = [cur];
      if (first && startPt !== first) { out.push(first); cur = first; }
      while (rest.length) { const nx = rest.reduce((a, b) => (dist(cur, b) < dist(cur, a) ? b : a)); out.push(nx); rest = rest.filter((x) => x !== nx); cur = nx; }
      if (last && endPt !== last) out.push(last);
      path = out;
    }
    setRouteOrder((all) => ({ ...(all || {}), [k]: [...path.filter((x) => x.id !== '_home').map((x) => x.id), ...noGeo] }));
    setRoute(true);
    setNote('Route optimized by road (saved in Hub)'); setTimeout(() => setNote(''), 2500);
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-3">
      {/* Toolbar like Jobber: row 1 = month, arrows, Today, Find a Time, filters · row 2 = views + tools */}
      <div className="space-y-2 pb-2 border-b border-border-subtle">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-primary min-w-[12ch] mr-1">{title}</h1>
          <button onClick={() => step(-1)} title="Back" className="rounded-lg border border-border-default px-3 py-1 text-sm font-semibold cursor-pointer text-primary"><ChevronLeft size={16} /></button>
          <button onClick={() => step(1)} title="Forward" className="rounded-lg border border-border-default px-3 py-1 text-sm font-semibold cursor-pointer text-primary"><ChevronRight size={16} /></button>
          <button onClick={() => setAnchor(new Date())} className="rounded-lg border border-border-default px-3 py-1 text-sm font-semibold cursor-pointer text-primary">Today</button>
        <FilterPill label="Type"
          value={types.size === TYPES.length ? 'All' : types.size === 0 ? 'None' : types.size === 1 ? TYPES.find(([t]) => types.has(t))[1] : `${types.size} types`}
          options={TYPES.map(([t, l]) => ({ id: t, label: l, count: counts[t], dot: colorOf({ type: t, recurring: true }) }))}
          selected={types} multi
          onToggle={(id) => setTypes((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
          onAll={() => setTypes(new Set(TYPES.map(([t]) => t)))} />
        <FilterPill label="Team"
          value={team.size === 0 ? 'All' : team.size <= 2 ? [...teamList, { id: '_none', name: 'Unassigned' }].filter((u) => team.has(u.id)).map((u) => u.name).join(', ') : `${team.size} people`}
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border-default overflow-hidden">
            {[['month', 'Month'], ['week', 'Week'], ['day', 'Day']].map(([id, l]) => (
              <button key={id} onClick={() => setView(id)} className={`px-3 py-1 text-sm font-semibold cursor-pointer ${view === id ? 'text-[#7DC243] ring-1 ring-inset ring-[#7DC243] rounded-lg' : 'text-secondary hover:text-primary'}`}>{l}</button>
            ))}
          </div>
          <button onClick={() => { setShowMap((v) => !v); if (view !== 'day') setView('day'); }} title="Map" className={`rounded-lg border border-border-default px-3 py-1 text-sm font-semibold cursor-pointer ${showMap && view === 'day' ? 'text-[#7DC243] border-[#7DC243]' : 'text-primary'}`}><MapIcon size={16} /></button>
          <div className="relative">
            <button onClick={() => setMoreOpen((o) => !o)} className="rounded-lg border border-border-default px-3 py-1 text-sm font-semibold cursor-pointer text-[#7DC243]">··· More</button>
            {moreOpen && (
              <div className="absolute left-0 top-full mt-1 z-[1100] w-52 rounded-xl border border-border-default bg-card shadow-2xl py-1.5 text-sm">
                <button onClick={() => { setMoreOpen(false); setCreate({ date: ymd(view === 'day' ? start : new Date()), time: '09:00', allDay: false }); }} className="w-full flex items-center gap-2 px-3 py-2 text-primary hover:bg-surface-alt cursor-pointer"><Plus size={14} /> New task / event / visit</button>
                <button onClick={() => { setMoreOpen(false); setLanes((v) => !v); if (view !== 'day') setView('day'); }} className="w-full flex items-center gap-2 px-3 py-2 text-primary hover:bg-surface-alt cursor-pointer"><Users size={14} /> {lanes ? 'One column' : 'Column per person'}</button>
                <button onClick={() => { setMoreOpen(false); setColorsOpen(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-primary hover:bg-surface-alt cursor-pointer"><Palette size={14} /> Schedule settings</button>
              </div>
            )}
          </div>
          <button onClick={() => load(true)} disabled={busy} title="Refresh from Jobber" className="ml-auto rounded-lg border border-border-default p-2 text-secondary hover:text-primary cursor-pointer disabled:opacity-50"><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /></button>
        </div>
      </div>
      {err && <p className="rounded-lg bg-red-500/10 text-red-400 px-3 py-2 text-sm flex justify-between">{err}<button onClick={() => setErr('')} className="cursor-pointer"><X size={14} /></button></p>}
      {note && <p className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-full bg-card border border-border-default px-4 py-2 text-sm text-primary shadow-2xl">{note}</p>}

      <div className="flex gap-3 items-start">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-border-subtle bg-card">
          {view === 'month' ? (
            <div className="min-w-[760px]">
              <div className="grid grid-cols-7 border-b border-border-subtle">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <div key={d} className="py-2 text-center"><span className={`rounded-md px-2 py-0.5 text-sm font-bold ${i === new Date().getDay() && anchor.getMonth() === new Date().getMonth() ? 'bg-[#3B82C4] text-white' : 'text-primary'}`}>{d}</span></div>)}
              </div>
              <div className="grid grid-cols-7">
                {cols.map((d) => {
                  const k = ymd(d); const list = [...(byDay[k]?.anytime || []), ...(byDay[k]?.timed || [])];
                  const other = d.getMonth() !== anchor.getMonth();
                  return (
                    <div key={k} onDragEnter={allowDrop} onDragOver={allowDrop} onDrop={(e) => dropMonth(e, d)}
                      onClick={(e) => { if (e.target === e.currentTarget) setCreate({ date: k, time: '09:00', allDay: true }); }}
                      className={`min-h-[112px] border-b border-l border-border-subtle p-1 space-y-[3px] ${other ? 'opacity-45' : ''}`}>
                      <div className="flex items-center gap-1.5 px-0.5 pb-0.5">
                        <button onClick={() => { setAnchor(d); setView('day'); }} className={`text-sm font-bold px-1 rounded cursor-pointer ${k === todayStr ? 'bg-[#3B82C4] text-white' : 'text-primary hover:underline'}`}>{d.getDate()}</button>
                        {list.length > 0 && <span className="rounded border border-border-default px-1 text-[10px] text-secondary">{list.length} visit{list.length === 1 ? '' : 's'}</span>}
                      </div>
                      {list.map((it) => chip(it, false, undefined, true))}
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
                  return (
                    <div key={l.key} className="py-2.5 flex flex-col items-center gap-1">
                      <p className="flex items-center gap-2 text-sm font-bold text-primary"><span className="w-7 h-7 rounded-full bg-white/90 text-black text-xs font-bold flex items-center justify-center">{l.label[0]}</span>{l.label}</p>
                      <span className="rounded border border-border-default px-1.5 text-[11px] text-secondary">{n} visit{n === 1 ? '' : 's'}</span>
                    </div>
                  );
                }) : cols.map((d) => {
                  const k = ymd(d); const isToday = k === todayStr;
                  const n = (byDay[k]?.timed.length || 0) + (byDay[k]?.anytime.length || 0);
                  return (
                    <button key={k} onClick={() => { setAnchor(d); setView('day'); }} className="py-2 text-center cursor-pointer hover:bg-surface-alt">
                      <span className={`inline-block rounded-md px-2.5 py-1 text-base font-bold ${isToday ? 'bg-[#3B82C4] text-white' : 'text-primary'}`}>{d.getDate()} {d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                      {view === 'day' && <span className="mt-1.5 mx-auto block w-fit rounded border border-border-default px-1.5 text-[11px] text-secondary">{n} visit{n === 1 ? '' : 's'}</span>}
                    </button>
                  );
                })}
              </div>
              {/* anytime */}
              <div className="grid border-b-2 border-border-default" style={{ gridTemplateColumns: `56px repeat(${dayLanes ? dayLanes.length : days}, minmax(0, 1fr))` }}>
                <div className="px-1 pt-2 flex flex-col items-center gap-2">
                  <button onClick={() => setAnyCollapsed((v) => !v)} className="text-[12px] text-tertiary hover:text-primary cursor-pointer">{anyCollapsed ? '↑' : '↓'} Anytime</button>
                  {view === 'day' && (
                    <div className="relative">
                      <button onClick={() => setOptOpen((v) => !v)} title="Route"
                        className={`rounded-lg border p-1.5 cursor-pointer ${route ? 'border-[#7DC243] text-[#7DC243] bg-[#7DC243]/10' : 'border-border-default text-secondary hover:text-primary'}`}>
                        <ListOrdered size={16} />
                      </button>
                      {optOpen && <RouteOptimize day={start} home={home} homeStart={!!COLORS.homeStart} homeEnd={!!COLORS.homeEnd} route={route} setRoute={setRoute} onOptimize={optimize} onClose={() => setOptOpen(false)} />}
                    </div>
                  )}
                </div>
                {(dayLanes || cols).map((c) => {
                  const d = dayLanes ? start : c; const k = ymd(d);
                  const list = dayLanes ? laneItems(c.key, byDay[k]?.anytime || []) : (byDay[k]?.anytime || []);
                  return (
                    <div key={dayLanes ? c.key : k} onDragEnter={allowDrop}
                      onDragOver={(e) => { allowDrop(e); if (route && drag.current && sameDayAnytime(drag.current, d)) markDrop(k, null); }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropAt(null); }}
                      onDrop={(e) => dropAnytime(e, d)}
                      onClick={(e) => { if (e.target === e.currentTarget) setCreate({ date: k, time: '09:00', allDay: true }); }}
                      className="p-1 space-y-[3px] border-l border-border-subtle min-h-[40px]">
                      {anyCollapsed ? (list.length ? <p className="px-1 py-1 text-xs text-tertiary">{list.length} anytime item{list.length === 1 ? '' : 's'}</p> : null) : list.map((it, i) => chip(it, true, route && view === 'day' && !dayLanes ? i + 1 : undefined))}
                      {dropAt && dropAt.day === k && dropAt.before === null && dropLine}
                    </div>
                  );
                })}
              </div>
              {/* hours */}
              <div className="grid" style={{ gridTemplateColumns: `56px repeat(${dayLanes ? dayLanes.length : days}, minmax(0, 1fr))` }}>
                <div>{HOURS.map((h) => <div key={h} className="text-[10px] text-tertiary text-right pr-1.5" style={{ height: ROW }}>{h > 12 ? h - 12 : h} {h >= 12 ? 'PM' : 'AM'}</div>)}</div>
                {dayLanes
                  ? dayLanes.map((l) => timedCol(start, laneItems(l.key, byDay[ymd(start)]?.timed || []), l.key))
                  : cols.map((d) => timedCol(d, byDay[ymd(d)]?.timed || [], ymd(d)))}
              </div>
            </div>
          )}
        </div>

        {/* Right side: unscheduled list and/or day map */}
        {view === 'day' && showMap && (
          <div className="shrink-0 sticky top-2 rounded-xl border border-border-subtle bg-card overflow-hidden flex flex-col" style={{ width: mapBig ? '62%' : showUnsched ? '34%' : '44%', height: 'calc(100vh - 170px)' }}>
            <div className="flex justify-end gap-1 px-2 py-1.5 border-b border-border-subtle">
              <button onClick={() => setMapBig((v) => !v)} title={mapBig ? 'Make map smaller' : 'Make map larger'} className="p-1 text-secondary hover:text-primary cursor-pointer">{mapBig ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
              <button onClick={() => setShowMap(false)} title="Close map" className="p-1 text-secondary hover:text-primary cursor-pointer"><X size={16} /></button>
            </div>
            <div className="relative isolate z-0 flex-1">
              <Suspense fallback={<p className="p-4 text-sm text-muted">Loading map…</p>}>
                <ScheduleMap stops={mapStops} route={route} home={home} homeStart={homeStart} homeEnd={homeEnd} hoverId={hoverId} onHover={setHoverId} recenter={recenter} label={pinLabel}
                  onPick={(x) => setPopup({ ...x, _rect: { left: window.innerWidth / 2 - 170, top: 200, bottom: 200, width: 340 } })} />
              </Suspense>
              <button onClick={() => setRecenter((n) => n + 1)} className="absolute bottom-3 right-3 z-[500] rounded-lg bg-card border border-border-default px-3 py-1.5 text-sm font-semibold text-primary cursor-pointer">Re-center</button>
            </div>
          </div>
        )}
        {showUnsched && (
          <div className="w-[300px] shrink-0 space-y-3">
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
      {colorsOpen && <ColorRules places={(current?.items || []).filter((x) => x.address && x.lat && x.lng)} business={business} value={schedColors || DEFAULT_COLORS} onSave={(v) => { setSchedColors(v); setColorsOpen(false); }} onClose={() => setColorsOpen(false)} />}
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
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold cursor-pointer ${active ? 'border-[#7DC243] bg-[#7DC243]/15 text-primary' : 'border-border-default bg-surface-alt text-primary'}`}>
        {label}<span className="h-3.5 w-px bg-border-strong" /><span className={active ? 'text-[#7DC243]' : 'text-secondary'}>{value}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-[1100] w-56 rounded-xl border border-border-default bg-card shadow-2xl py-1.5">
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

// Color rules editor: type colors + keyword rules (first match wins).
function ColorRules({ value, business, places = [], onSave, onClose }) {
  const [v, setV] = useState(() => JSON.parse(JSON.stringify(value)));
  const setType = (t, c) => setV((x) => ({ ...x, types: { ...x.types, [t]: c } }));
  const setRule = (i, patch) => setV((x) => ({ ...x, rules: x.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const move = (i) => setV((x) => { if (i === 0) return x; const r = [...x.rules]; [r[i - 1], r[i]] = [r[i], r[i - 1]]; return { ...x, rules: r }; });
  const [pickerFor, setPickerFor] = useState(null);
  const palette = [...SWATCHES, ...(v.custom || []).filter((c) => !SWATCHES.includes(c))];
  const addCustom = (c) => setV((x) => ({ ...x, custom: [...new Set([...(x.custom || []), c])].slice(-12) }));
  // Swatches + your own colors + a picker / hex box to add more.
  const swatches = (cur, pick, key) => (
    <div className="flex flex-wrap items-center gap-1">
      {palette.map((c) => <button key={c} onClick={() => pick(c)} className={`w-5 h-5 rounded cursor-pointer ${cur === c ? 'ring-2 ring-white' : ''}`} style={{ background: c }} />)}
      <span className="relative ml-1">
        <button onClick={() => setPickerFor(pickerFor === key ? null : key)} className={`inline-flex items-center gap-1 rounded border px-1.5 h-6 text-[11px] font-semibold cursor-pointer ${pickerFor === key ? 'border-[#7DC243] text-[#7DC243]' : 'border-border-default text-secondary hover:text-primary'}`}><Plus size={11} /> Custom</button>
        {pickerFor === key && <ShadePicker value={cur} onChange={pick} onDone={(c) => { addCustom(c); setPickerFor(null); }} />}
      </span>
      <input defaultValue={cur} key={cur} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        onBlur={(e) => { let h = e.target.value.trim(); if (!h.startsWith('#')) h = `#${h}`; if (/^#[0-9a-f]{6}$/i.test(h)) { pick(h.toUpperCase()); addCustom(h.toUpperCase()); } else e.target.value = cur; }}
        className="w-[76px] h-6 rounded border border-border-default bg-surface-alt px-1.5 text-[11px] font-mono text-primary" title="Type a color code like #FF8800" />
    </div>
  );
  return (
    <Modal title="Schedule settings" onClose={onClose} wide>
      <RouteHome v={v} setV={setV} business={business} places={places} />
      <p className="mt-5 text-sm font-bold text-primary">Colors</p>
      <p className="text-xs text-tertiary">Visits whose title contains a word get that color. Top rule wins. Everything else uses its type color.</p>
      <p className="mt-3 text-xs font-bold text-secondary uppercase tracking-wide">Word rules (visits)</p>
      <div className="mt-2 space-y-2">
        {v.rules.map((r, i) => (
          <div key={r.id} className="rounded-lg border border-border-subtle p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded shrink-0" style={{ background: r.color }} />
              <input value={r.words} onChange={(e) => setRule(i, { words: e.target.value })} placeholder="words, separated, by commas" className={field.replace('mt-1 ', '')} />
              <button onClick={() => move(i)} disabled={i === 0} title="Move up" className="text-muted hover:text-primary disabled:opacity-30 cursor-pointer"><ArrowUp size={15} /></button>
              <button onClick={() => setV((x) => ({ ...x, rules: x.rules.filter((_, j) => j !== i) }))} title="Remove" className="text-muted hover:text-red-400 cursor-pointer"><Trash2 size={15} /></button>
            </div>
            {swatches(r.color, (c) => setRule(i, { color: c }), `r${r.id}`)}
          </div>
        ))}
        <button onClick={() => setV((x) => ({ ...x, rules: [...x.rules, { id: `r${Date.now()}`, words: '', color: '#1D4ED8' }] }))} className="rounded-lg border border-dashed border-border-default px-3 py-1.5 text-sm text-secondary hover:text-primary cursor-pointer"><Plus size={13} className="inline -mt-0.5" /> Add rule</button>
      </div>
      <p className="mt-4 text-xs font-bold text-secondary uppercase tracking-wide">Type colors</p>
      <div className="mt-2 space-y-2">
        {[['Visit', 'Visits (no word match)'], ['Assessment', 'Assessments & requests'], ['Task', 'Tasks'], ['Event', 'Events']].map(([t, l]) => (
          <div key={t} className="rounded-lg border border-border-subtle p-2.5 space-y-2">
            <span className="flex items-center gap-2 text-sm text-primary"><span className="w-4 h-4 rounded" style={{ background: v.types[t] }} />{l}</span>
            {swatches(v.types[t], (c) => setType(t, c), `t${t}`)}
          </div>
        ))}
      </div>
      <div className="mt-5 flex gap-2">
        <button onClick={() => onSave({ ...v, rules: v.rules.filter((r) => wordsOf(r).length) })} className="flex-1 rounded-lg bg-[#7DC243] py-2 text-sm font-bold text-black cursor-pointer">Save</button>
        <button onClick={() => setV((x) => ({ ...JSON.parse(JSON.stringify(DEFAULT_COLORS)), home: x.home, homeStart: x.homeStart, homeEnd: x.homeEnd, custom: x.custom }))} className="rounded-lg border border-border-subtle px-3 py-2 text-sm text-secondary cursor-pointer">Reset</button>
      </div>
    </Modal>
  );
}

// Jobber-style "Optimize anytime appointments" popover, plus the route on/off switch.
function RouteOptimize({ day, home, homeStart, homeEnd, route, setRoute, onOptimize, onClose }) {
  const [first, setFirst] = useState(false);
  const [last, setLast] = useState(false);
  const [shopStart, setShopStart] = useState(homeStart);
  const [shopEnd, setShopEnd] = useState(homeEnd);
  return (
    <div className="absolute left-0 top-full mt-2 z-[1100] w-80 rounded-xl border border-border-default bg-card shadow-2xl p-4 text-left">
      <div className="flex items-center justify-between"><span className="text-muted text-xs tracking-widest">⠿</span><button onClick={onClose} className="text-muted hover:text-primary cursor-pointer"><X size={15} /></button></div>
      <p className="mt-1 font-black text-primary">Optimize anytime appointments</p>
      <p className="mt-1 text-sm text-tertiary">Reorders this day's anytime stops into the shortest route. Saved in Hub (Jobber's app keeps its own order).</p>
      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-3 py-1 text-sm text-primary">{day.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'long' })}</span>
      {home ? (
        <>
          <label className="mt-3 flex items-center gap-2 text-sm text-primary cursor-pointer"><input type="checkbox" checked={shopStart} onChange={(e) => setShopStart(e.target.checked)} className="w-4 h-4 accent-[#7DC243]" />🏠 Start at shop</label>
          <label className="mt-2 flex items-center gap-2 text-sm text-primary cursor-pointer"><input type="checkbox" checked={shopEnd} onChange={(e) => setShopEnd(e.target.checked)} className="w-4 h-4 accent-[#7DC243]" />🏠 End at shop</label>
        </>
      ) : <p className="mt-3 text-xs text-muted">Add your shop address in More → Schedule settings to start/end routes there.</p>}
      <label className="mt-3 flex items-center gap-2 text-sm text-primary cursor-pointer"><input type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} className="w-4 h-4 accent-[#7DC243]" />Keep first appointment as start of route</label>
      <label className="mt-2 flex items-center gap-2 text-sm text-primary cursor-pointer"><input type="checkbox" checked={last} onChange={(e) => setLast(e.target.checked)} className="w-4 h-4 accent-[#7DC243]" />Keep last appointment as end of route</label>
      <label className="mt-3 pt-3 border-t border-border-subtle flex items-center justify-between text-sm text-primary cursor-pointer">Show route (numbers + line)
        <input type="checkbox" checked={route} onChange={(e) => setRoute(e.target.checked)} className="w-4 h-4 accent-[#7DC243]" />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-border-default px-3 py-1.5 text-sm font-semibold text-primary cursor-pointer">Cancel</button>
        <button onClick={() => onOptimize(first, last, shopStart, shopEnd)} className="rounded-lg bg-[#7DC243] px-3 py-1.5 text-sm font-bold text-black cursor-pointer">Optimize</button>
      </div>
    </div>
  );
}

// Route home base: business address (Settings) or a searched address; start and/or end each route there.
function RouteHome({ v, setV, business, places = [] }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [busy, setBusy] = useState(false);
  const biz = business?.lat && business?.lon ? { address: [business.street, business.city].filter(Boolean).join(', '), lat: Number(business.lat), lng: Number(business.lon) } : null;
  const cur = v.home?.lat ? v.home : biz;
  // Suggestions as you type (like the address box in Settings), biased to around the business.
  useEffect(() => {
    const t0 = q.trim();
    if (t0.length < 4) { setFound([]); return undefined; }
    const c = biz || { lat: 34.94, lng: -81.03 };
    const box = [c.lng - 0.6, c.lat + 0.45, c.lng + 0.6, c.lat - 0.45].join(',');
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=6&addressdetails=1&viewbox=${box}&q=${encodeURIComponent(t0)}`);
        const d = await r.json();
        // Addresses Jobber already has (exact pins, e.g. the Shop client) first, then map search results.
        const words = t0.toLowerCase().split(/\s+/).filter(Boolean);
        const seen = new Set();
        const fromJobber = places.filter((x) => { const hay = `${x.address} ${x.client || ''}`.toLowerCase(); return words.every((w) => hay.includes(w)); })
          .filter((x) => !seen.has(x.address) && seen.add(x.address)).slice(0, 4)
          .map((x) => ({ address: x.address, lat: x.lat, lng: x.lng, note: x.client ? `Jobber · ${x.client}` : 'Jobber' }));
        // Jobber clients by name/address (e.g. "Shop"), placed on the map later if Jobber has no pin for them.
        const cl = await fetch(`/api/jobber-data?action=clients&q=${encodeURIComponent(t0)}`).then((x) => (x.ok ? x.json() : [])).catch(() => []);
        const fromClients = (Array.isArray(cl) ? cl : []).filter((c) => c.address).slice(0, 3)
          .map((c) => ({ address: [c.address, c.city, c.state].filter(Boolean).join(', '), clientId: c.id, note: `Jobber client · ${c.name}` }))
          .filter((c) => !seen.has(c.address) && seen.add(c.address));
        setFound([...fromJobber, ...fromClients, ...(d || []).map((x) => {
          const a = x.address || {};
          const street = [a.house_number, a.road].filter(Boolean).join(' ');
          return { address: [street || x.display_name.split(', ')[0], a.city || a.town || a.village || a.hamlet, a.state].filter(Boolean).join(', '), lat: Number(x.lat), lng: Number(x.lon) };
        })]);
      } catch { setFound([]); } finally { setBusy(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <p className="text-sm font-bold text-primary">Shop address</p>
      <div className="mt-2 rounded-lg border border-border-subtle p-3 space-y-2">
        <p className="text-sm text-primary">🏠 {cur ? cur.address : 'No address set'} {v.home?.lat ? <span className="text-xs text-tertiary">(custom)</span> : <span className="text-xs text-tertiary">(business address in Settings)</span>}</p>
        <div className="relative">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type the shop address…" className={field.replace('mt-1 ', '')} />
          {busy && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">searching…</span>}
          {found.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-10 rounded-lg border border-border-default bg-card shadow-xl py-1">
              {found.map((f, i) => (
                <button key={i} onClick={async () => {
                  let pick = f;
                  if (!f.lat && f.clientId) { // Jobber's own pin for that client's property
                    const pt = await fetch(`/api/jobber-data?action=client-pin&id=${encodeURIComponent(f.clientId)}`).then((x) => x.json()).catch(() => null);
                    if (!pt?.lat) return;
                    pick = { address: f.address, lat: pt.lat, lng: pt.lng };
                  }
                  setV((x) => ({ ...x, home: { address: pick.address, lat: pick.lat, lng: pick.lng } })); setFound([]); setQ('');
                }} className="flex w-full items-start gap-2 text-left px-3 py-2 text-sm text-primary hover:bg-surface-alt cursor-pointer"><MapPin size={14} className="mt-0.5 shrink-0 text-tertiary" /><span>{f.address}{f.note && <span className="block text-xs text-[#7DC243]">{f.note}</span>}</span></button>
              ))}
            </div>
          )}
          {!busy && q.trim().length >= 4 && !found.length && <p className="mt-1 text-xs text-muted">No matches yet — try adding the city.</p>}
        </div>
        {v.home?.lat && biz && <button onClick={() => setV((x) => ({ ...x, home: null }))} className="text-xs text-tertiary underline cursor-pointer">Use business address instead</button>}
        <p className="text-xs text-tertiary">Pick "Start at shop" / "End at shop" when you optimize a route (route button under Anytime).</p>
      </div>
    </div>
  );
}

// Color picker built into the page: drag in the square for the shade, drag or scroll the rainbow bar for the color.
const hexToHsv = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return { h: 120, s: 0.6, v: 0.45 };
  const n = parseInt(m[1], 16); const r = (n >> 16) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
};
const hsvToHex = ({ h, s, v }) => {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return `#${[f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
};
function ShadePicker({ value, onChange, onDone }) {
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const hex = hsvToHex(hsv);
  const set = (next) => { setHsv(next); onChange(hsvToHex(next)); };
  const drag = (e, fn) => {
    const el = e.currentTarget; el.setPointerCapture(e.pointerId);
    const move = (ev) => { const r = el.getBoundingClientRect(); fn(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))); };
    move(e);
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  };
  return (
    <div className="absolute left-0 top-full mt-1 z-20 w-56 rounded-xl border border-border-default bg-card shadow-2xl p-3 space-y-2.5">
      <div onPointerDown={(e) => drag(e, (x, y) => set({ ...hsv, s: x, v: 1 - y }))} className="relative h-32 rounded-lg cursor-crosshair touch-none"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv.h}, 100%, 50%)` }}>
        <span className="absolute w-3.5 h-3.5 -ml-[7px] -mt-[7px] rounded-full border-2 border-white shadow pointer-events-none" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
      </div>
      <div onPointerDown={(e) => drag(e, (x) => set({ ...hsv, h: x * 359 }))}
        onWheel={(e) => set({ ...hsv, h: (hsv.h + (e.deltaY > 0 ? 6 : -6) + 360) % 360 })}
        className="relative h-3.5 rounded-full cursor-pointer touch-none" title="Drag or scroll to change color"
        style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}>
        <span className="absolute top-1/2 w-3.5 h-3.5 -ml-[7px] -translate-y-1/2 rounded-full border-2 border-white shadow pointer-events-none" style={{ left: `${(hsv.h / 359) * 100}%`, background: `hsl(${hsv.h}, 100%, 50%)` }} />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-md border border-border-default" style={{ background: hex }} />
        <span className="flex-1 font-mono text-xs text-secondary">{hex}</span>
        <button onClick={() => onDone(hex)} className="rounded-lg bg-[#7DC243] px-2.5 py-1 text-xs font-bold text-black cursor-pointer">Done</button>
      </div>
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
      <label className="text-xs text-tertiary col-span-3">Date<input type="date" value={v.date} onChange={(e) => set({ ...v, date: e.target.value })} className={field} /></label>
      <label className="text-xs text-tertiary col-span-2 sm:col-span-1">Start<input type="time" value={v.time} disabled={v.allDay} onChange={(e) => set({ ...v, time: e.target.value })} className={`${field} disabled:opacity-40`} /></label>
      <label className="text-xs text-tertiary">Length<select value={v.minutes} disabled={v.allDay} onChange={(e) => set({ ...v, minutes: Number(e.target.value) })} className={`${field} disabled:opacity-40`}>{LENGTHS.map((m) => <option key={m} value={m}>{lenLabel(m)}</option>)}</select></label>
      {allowAllDay && <label className="col-span-3 flex items-center gap-2 text-sm text-secondary"><input type="checkbox" checked={!!v.allDay} onChange={(e) => set({ ...v, allDay: e.target.checked })} /> Anytime that day</label>}
    </div>
  );
}

function H({ children }) { return <p className="text-sm font-bold text-primary mt-3 mb-1">{children}</p>; }

// Click on anything: a popover next to it, laid out like Jobber's (Completed, Details, Team, Location, Start, Line items).
function ItemPopup({ it, team, auth, onClose, act, navigate }) {
  const [more, setMore] = useState(null);
  const [edit, setEdit] = useState(false);
  const [addCrew, setAddCrew] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [when, setWhen] = useState(() => ({
    date: it.startAt ? ymd(new Date(it.startAt)) : ymd(new Date()),
    time: it.startAt && !it.allDay ? hm(new Date(it.startAt)) : '09:00',
    minutes: it.startAt ? minsOf(it) : 60,
    allDay: it.startAt ? !!it.allDay : true,
  }));
  const ref = useRef(null);
  useEffect(() => {
    if (it.type !== 'Visit') return;
    fetch(`/api/jobber-today?visit=${encodeURIComponent(it.id)}`, { headers: auth }).then((r) => r.json()).then((d) => !d.error && setMore(d)).catch(() => {});
  }, [it.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    const click = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('[data-chip]')) onClose(); };
    document.addEventListener('keydown', key);
    const t = setTimeout(() => document.addEventListener('mousedown', click), 0);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', click); clearTimeout(t); };
  }, [onClose]);
  // Sit next to the clicked bar (below it, or above if there's no room), kept on screen.
  const W = 340;
  const r = it._rect || { left: window.innerWidth / 2 - W / 2, bottom: 120, top: 120, width: 0 };
  const left = Math.min(Math.max(8, r.left + Math.min(r.width, 260) / 2 - W / 2 + 60), window.innerWidth - W - 8);
  const vh = window.innerHeight;
  const spaceBelow = vh - r.bottom - 14; const spaceAbove = r.top - 14;
  const pos = Math.max(spaceBelow, spaceAbove) < 360
    ? { top: 24, maxHeight: vh - 48 } // not much room either way: use the full height
    : spaceBelow >= spaceAbove ? { top: r.bottom + 6, maxHeight: spaceBelow } : { bottom: vh - r.top + 6, maxHeight: spaceAbove };

  const go = async (body, msg, keepOpen) => { setSaving(true); const ok = await act(body, msg); setSaving(false); if (ok && !keepOpen) onClose(); return ok; };
  const isVisit = it.type === 'Visit';
  const canDone = isVisit || it.type === 'Assessment';
  const moveOp = { Visit: 'visit-move', Task: 'task-move', Assessment: 'assessment-move', Event: 'event-move' }[it.type];
  const crewIds = (it.crew || []).map((c) => c.id);
  const setCrew = (ids) => go({ op: 'visit-assign', id: it.id, userIds: ids }, 'Team updated', true);
  const total = (more?.lineItems || []).reduce((t, l) => t + (Number(l.total) || 0), 0);
  const btn = 'rounded-lg border border-border-default px-3 py-1.5 text-sm font-semibold text-primary hover:bg-surface-alt cursor-pointer disabled:opacity-50';

  return (
    <div ref={ref} className="fixed z-[1200] rounded-xl border border-border-default bg-card shadow-2xl flex flex-col" style={{ left, width: W, ...pos }}>
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="text-muted text-xs tracking-widest">⠿</span>
        <button onClick={onClose} className="text-muted hover:text-primary cursor-pointer"><X size={16} /></button>
      </div>
      <div className="px-4 pb-3 overflow-y-auto min-h-0 flex-1">
        <p className="text-lg font-black text-primary leading-snug">{it.title}</p>
        <p className="text-sm text-tertiary">{it.type}{it.unscheduled ? ' · unscheduled' : ''}</p>
        {canDone && !it.unscheduled && (
          <label className="mt-2 flex items-center gap-2 text-sm text-primary cursor-pointer">
            <input type="checkbox" checked={!!it.done} disabled={saving}
              onChange={() => go({ op: isVisit ? (it.done ? 'visit-uncomplete' : 'visit-complete') : (it.done ? 'assessment-uncomplete' : 'assessment-complete'), id: it.id }, it.done ? 'Marked not done' : 'Completed ✓', true)}
              className="w-4 h-4 accent-[#7DC243]" />
            Completed
          </label>
        )}

        {(it.client || more?.job || more?.instructions) && <H>Details</H>}
        {(it.client || more?.job) && (
          <p className="text-sm">
            {it.client && <span className="text-[#7DC243] underline">{it.client}</span>}
            {more?.job && <> <span className="text-tertiary">-</span> <a href={more.job.url} target="_blank" rel="noreferrer" className="text-[#7DC243] underline">Job #{more.job.number}</a></>}
          </p>
        )}
        {more?.instructions && <p className="mt-1 text-sm text-secondary line-clamp-3 whitespace-pre-wrap">{more.instructions}</p>}

        {isVisit && (
          <>
            <H>Team</H>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="relative">
                <button onClick={() => setAddCrew((v) => !v)} className="w-8 h-8 rounded-lg border border-border-default text-[#7DC243] flex items-center justify-center cursor-pointer hover:bg-surface-alt"><Plus size={15} /></button>
                {addCrew && (
                  <div className="absolute left-0 top-full mt-1 z-10 w-48 rounded-lg border border-border-default bg-card shadow-xl py-1">
                    {team.filter((u) => !crewIds.includes(u.id)).map((u) => (
                      <button key={u.id} onClick={() => { setAddCrew(false); setCrew([...crewIds, u.id]); }} className="w-full text-left px-3 py-1.5 text-sm text-primary hover:bg-surface-alt cursor-pointer">{u.name}</button>
                    ))}
                    {team.every((u) => crewIds.includes(u.id)) && <p className="px-3 py-1.5 text-xs text-muted">Everyone's on it</p>}
                  </div>
                )}
              </div>
              {(it.crew || []).map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt pl-1 pr-1.5 py-1 text-sm text-primary">
                  <span className="w-6 h-6 rounded-full bg-[#E8EBEE] text-[10px] font-bold text-[#3A4550] flex items-center justify-center">{String(c.name || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span>
                  {c.name}
                  <button onClick={() => setCrew(crewIds.filter((x) => x !== c.id))} disabled={saving} title="Remove" className="w-5 h-5 rounded-full bg-black/40 text-white flex items-center justify-center cursor-pointer hover:bg-black/60"><X size={11} /></button>
                </span>
              ))}
            </div>
          </>
        )}

        {it.address && (<><H>Location</H><a href={`https://maps.google.com/?q=${encodeURIComponent(it.address)}`} target="_blank" rel="noreferrer" className="text-sm text-secondary hover:text-primary">{it.address}</a></>)}
        {more?.phone && <a href={`tel:${more.phone}`} className="mt-1 flex items-center gap-1.5 text-sm text-[#7DC243]"><Phone size={13} />{more.phone}</a>}

        {it.startAt && (
          <>
            <H>Start</H>
            <p className="text-sm text-secondary">{new Date(it.startAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            <p className="text-sm text-secondary">{it.allDay ? 'Anytime' : `${timeOf(it.startAt)} – ${timeOf(it.endAt)}`}</p>
          </>
        )}

        {!!more?.lineItems?.length && (
          <>
            <H>Line items</H>
            <div className="rounded-lg border border-border-subtle overflow-hidden text-sm">
              {more.lineItems.map((l, i) => (
                <div key={i} className="flex gap-2 px-3 py-2 border-b border-border-subtle">
                  <span className="text-tertiary">{l.qty || 1}×</span><span className="flex-1 text-primary">{l.name}</span><span className="text-primary">${Number(l.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
              <div className="flex justify-end px-3 py-2 bg-surface-alt font-semibold text-primary">Total ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </div>
          </>
        )}
        {isVisit && !more && <p className="mt-3 text-xs text-muted">Loading details…</p>}

        {it.type === 'Task' && confirmDel && (
          <div className="mt-3 flex items-center gap-2 text-sm"><span className="text-red-400">Delete this task in Jobber?</span><button disabled={saving} onClick={() => go({ op: 'task-delete', id: it.id }, 'Task deleted')} className="rounded-lg bg-red-600 px-3 py-1 font-bold text-white cursor-pointer">Delete</button><button onClick={() => setConfirmDel(false)} className="text-secondary cursor-pointer">Cancel</button></div>
        )}
      </div>
      {edit && moveOp && (
          <div className="mx-4 mb-2 rounded-lg border border-[#7DC243]/50 bg-surface-alt p-3">
            <WhenFields v={when} set={setWhen} allowAllDay={it.type !== 'Assessment'} />
            <button disabled={saving} onClick={() => go({ op: moveOp, id: it.id, date: when.date, time: when.allDay ? undefined : when.time, allDay: when.allDay, minutes: when.minutes }, 'Rescheduled')} className="mt-2 rounded-lg bg-[#7DC243] px-3 py-1.5 text-sm font-bold text-black cursor-pointer disabled:opacity-50">{saving ? 'Saving…' : it.unscheduled ? 'Schedule it' : 'Save time'}</button>
          </div>
        )}
      <div className="flex items-center gap-2 border-t border-border-subtle px-4 py-3">
        {it.type === 'Task' && <button onClick={() => setConfirmDel(true)} title="Delete task" className="text-muted hover:text-red-400 cursor-pointer"><Trash2 size={16} /></button>}
        {moveOp && <button onClick={() => setEdit((v) => !v)} className={btn}><Clock size={14} className="inline -mt-0.5 mr-1" />{it.unscheduled ? 'Schedule' : 'Reschedule'}</button>}
        <div className="ml-auto flex gap-2">
          {it.type === 'Assessment' && it.requestId
            ? <button onClick={() => navigate(`/leads?r=${encodeURIComponent(it.requestId)}`)} className="rounded-lg bg-[#7DC243] px-3 py-1.5 text-sm font-bold text-black cursor-pointer">Details</button>
            : it.url && <a href={it.url} target="_blank" rel="noreferrer" className="rounded-lg bg-[#7DC243] px-3 py-1.5 text-sm font-bold text-black inline-flex items-center gap-1">Details <ExternalLink size={12} /></a>}
        </div>
      </div>
    </div>
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
