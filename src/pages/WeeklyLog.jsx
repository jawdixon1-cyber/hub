/* ─── Weekly log ───
 * Once a week, per crew: money in + COGS per day, hours per person, and any
 * unfinished jobs. The page turns that into wages, labor %, and the bonus
 * (see lib/weeklyBonus.js for the rule). Everything you type is a draft
 * until "Save week"; the bonus math updates live as you go. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { parseTime, minutesToHMM, minutesToDecimal } from '../lib/weeklyTime';
import { computeWeek, OT_AFTER_MINUTES, LIGHTS_LEAD_PCT, LIGHTS_TIERS, LIGHTS_INSTALL_TARGET, LIGHTS_REMOVAL_TARGET, LIGHTS_PLAN_FROM, isLightsJob, isLightsInstall } from '../lib/weeklyBonus';
import { useTeamMembers } from '../hooks/useTeamMembers';

const T = { log: 'weekly_log', jobs: 'weekly_log_jobs', settings: 'weekly_log_settings' };
const DEFAULT_CREW = 'Crew 1';
const WEEK_ENDS_ON = 6; // Saturday (weeks run Sun–Sat)
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

/* ─── dates ─── */
const addDaysISO = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
function weekEndingFor(iso) {
  const d = new Date(iso + 'T00:00:00');
  return addDaysISO(iso, (WEEK_ENDS_ON - d.getDay() + 7) % 7);
}
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
// The week to open on: the oldest one since your first close that isn't closed
// yet (so a skipped week shows up), else this week. Before you've ever closed a
// week, it's last week — payroll is done once the week is over.
function openWeekFor(rows, crew, thisWeek) {
  const closed = new Set(rows.filter((r) => r.crew === crew && r.closed_at).map((r) => r.week_ending));
  if (!closed.size) return addDaysISO(thisWeek, -7);
  for (let w = addDaysISO([...closed].sort()[0], 7); w < thisWeek; w = addDaysISO(w, 7)) if (!closed.has(w)) return w;
  return thisWeek;
}
const weekDays = (weekEnding) => Array.from({ length: 7 }, (_, i) => addDaysISO(weekEnding, i - 6));
const fmtDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
const fmtWeek = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/* ─── money ─── */
const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
const pctOf = (num, den) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—');
// What the business kept from a week after all the math (same as "We made" in the week summary), before overhead.
const madeOf = (h) => (h.allRevenue ?? h.revenue) - (h.allCogs ?? h.cogs) - h.wages - h.bonus - h.taxes;
const pctFmt = (p) => (p == null ? '—' : `${(p * 100).toFixed(1)}%`);
// Typed or pasted amounts can carry commas, a $ or spaces ("$1,620.00"); read them as the number.
const num = (v) => Math.round((Number(String(v ?? '').replace(/[$,\s]/g, '')) || 0) * 100) / 100;
const hmm = (m) => (m ? minutesToHMM(m) : '—');
const regOf = (m) => Math.min(m || 0, OT_AFTER_MINUTES);
const otOf = (m) => Math.max(0, (m || 0) - OT_AFTER_MINUTES);

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#B0FF03]';
const cell = 'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-right tabular-nums placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#B0FF03]';
// 5-star review bonus: the crew leader and (if there was one) the helper each get paid.
// Paid by owner's draw, not through ADP: their hours still count as labor (so the
// bonus math stays honest), but they're kept out of the ADP cards and totals.
const PAID_BY_DRAW = new Set(['jawdixon1@gmail.com']);
const ADP_PAYROLL_URL = 'https://runpayrollmain.adp.com/@836d254c-789b-41b8-8052-d48a639e95d8/v2/';
const REVIEW_PAY = { leader: 10, helper: 5 };
const reviewReason = (role, client) => `5-star review (${role})${client?.trim() ? ` — ${client.trim()}` : ''}`;
const EMPTY_DAY = { revenue: '', cogs: '', hours: '', jobs: [], np: {}, lights: {} };
const RANGES = [['4', '4 wks'], ['13', '13 wks'], ['52', '52 wks'], ['all', 'All']];
const th = 'px-3 py-2 text-right';
const GOAL_KEY = 'payroll-revhr-goal';
const LABOR_GOAL_KEY = 'payroll-labor-goal';
const DEFAULT_LABOR_GOAL = 30;
const fmt0 = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n) || 0);
// Rev/hr vs the goal: at/above = on target, within 20% = close, further = low. Each tone has a word too, so it's never color alone.
const TONES = {
  good: { box: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500', pill: 'bg-emerald-600 text-white', label: 'On target' },
  ok: { box: 'border-amber-200 bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-400', pill: 'bg-amber-400 text-amber-950', label: 'Close' },
  bad: { box: 'border-red-200 bg-red-50', text: 'text-red-600', bar: 'bg-red-500', pill: 'bg-red-600 text-white', label: 'Low' },
  none: { box: 'border-slate-200 bg-slate-50', text: 'text-slate-400', bar: 'bg-slate-300', pill: 'bg-slate-200 text-slate-600', label: 'No data' },
};
const toneOf = (rph, goal) => (rph == null || !goal ? 'none' : rph >= goal ? 'good' : rph >= goal * 0.8 ? 'ok' : 'bad');
const weekdayOf = (iso, style = 'long') => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: style });
const monthDayOf = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// Arrow keys move between boxes like a spreadsheet: up/down to the nearest box above/below
// in the same column, left/right to the next box in the row once the cursor is at the text's edge.
function arrowNav(e) {
  const el = e.target;
  if (el.tagName !== 'INPUT' || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
  const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
  if (!dir) return;
  const len = el.value.length, start = el.selectionStart ?? 0, end = el.selectionEnd ?? len, all = start === 0 && end === len;
  if (dir === 'left' && !all && start > 0) return;
  if (dir === 'right' && !all && end < len) return;
  const box = (x) => x.getBoundingClientRect(), me = box(el), mx = me.left + me.width / 2, my = me.top + me.height / 2;
  const others = [...e.currentTarget.querySelectorAll('input')].filter((x) => x !== el && !x.disabled && !x.readOnly && x.type !== 'checkbox' && x.offsetParent);
  let best = null, bestScore = Infinity;
  for (const x of others) {
    const r = box(x), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = cx - mx, dy = cy - my;
    const sameRow = Math.abs(dy) < me.height / 2;
    const ok = dir === 'up' ? dy < -4 && !sameRow : dir === 'down' ? dy > 4 && !sameRow : sameRow && (dir === 'left' ? dx < 0 : dx > 0);
    if (!ok) continue;
    // Prefer the closest row first, then the closest column.
    const score = dir === 'up' || dir === 'down' ? Math.abs(dy) * 4 + Math.abs(dx) : Math.abs(dx);
    if (score < bestScore) { bestScore = score; best = x; }
  }
  if (!best) return;
  e.preventDefault();
  best.focus();
  best.select();
}

/* ─── draft ⇄ db ─── */
function draftFromRow(row, week, people) {
  return {
    days: Object.fromEntries(weekDays(week).map((d) => { const e = row?.days?.[d]; return [d, { revenue: e?.revenue ? String(e.revenue) : '', cogs: e?.cogs ? String(e.cogs) : '', hours: e?.prod_minutes ? minutesToHMM(e.prod_minutes) : '', np: Object.fromEntries(Object.entries(e?.np_minutes || {}).map(([pid, m]) => [pid, minutesToHMM(m)])), lights: Object.fromEntries(Object.entries(e?.lights_minutes || {}).map(([pid, m]) => [pid, minutesToHMM(m)])), jobs: (e?.jobs || []).map((j) => ({ name: j.name || '', revenue: j.revenue ? String(j.revenue) : '', cogs: j.cogs ? String(j.cogs) : '', ...(j.jobberId ? { jobberId: j.jobberId } : {}), ...(j.split ? { split: j.split } : {}), ...(j.fixed ? { fixed: j.fixed } : {}) })) }]; })),
    hours: Object.fromEntries(people.map((p) => { const e = row?.people?.[p.id]; const total = e?.total_minutes ?? ((e?.prod_minutes || 0) + (e?.np_minutes || 0)); return [p.id, { total: total ? minutesToHMM(total) : '', np: e?.np_minutes ? minutesToHMM(e.np_minutes) : '' }]; })),
    extras: Object.entries(row?.people || {}).flatMap(([pid, e]) => (e.extras || []).filter((x) => !x.review).map((x) => ({ pid, reason: x.reason || '', amount: x.amount ? String(x.amount) : '' }))),
    reviews: Object.values(Object.entries(row?.people || {}).reduce((acc, [pid, e]) => {
      for (const x of e.extras || []) if (x.review) { const r = (acc[x.review.id] ||= { id: x.review.id, client: x.review.client || '', leader: '', helper: '' }); r[x.review.role] = pid; }
      return acc;
    }, {})),
    taxes: row?.employer_taxes ? String(row.employer_taxes) : '',
    notes: row?.notes || '',
  };
}
// Hours on unfinished jobs this week, per person, from the job drafts.
function jobMinutesFrom(jobs, week) {
  const out = {};
  for (const j of jobs) for (const [pid, m] of Object.entries(j.holds?.[week]?.people || {})) out[pid] = (out[pid] || 0) + (Number(m) || 0);
  return out;
}
// The draft as a weekly_log row, for live calc and for saving. Throws on a bad time.
// Production = total − non-prod − hours on unfinished jobs; you never type it.
// A one-off job worked over several days has its price split across them by
// hours (see api/jobber-data.js). Tag those lines so a partial amount isn't a surprise.
function splitOf(v) {
  const full = num(v.rawJobTotal);
  return v.jobType === 'ONE_OFF' && full > 0 && num(v.jobTotal) < full - 0.005 ? { of: full } : null;
}

// Fixed-price recurring jobs bill a set amount per invoice period (usually monthly) however many
// visits happen, so the full price per visit is inflated. Per visit = price ÷ visits in that period:
// weekly ≈ 4.33 a month (52 ÷ 12), every 2 weeks ≈ 2.17 (26 ÷ 12).
function fixedOf(v) {
  const b = v?.billing;
  if (v?.jobType !== 'RECURRING' || b?.type !== 'FIXED_PRICE' || b?.frequency !== 'PERIODIC') return null;
  const of = num(v.rawJobTotal ?? v.jobTotal);
  if (!of) return null;
  const vis = (b.visits || '').toLowerCase(), inv = (b.invoices || '').toLowerCase();
  const wk = vis.startsWith('weekly') ? 1 : +(vis.match(/every (\d+) weeks/)?.[1] || 0);
  const visitsPerMonth = wk ? 52 / wk / 12 : vis.startsWith('monthly') ? 1 : +(vis.match(/every (\d+) months/)?.[1] || 0) ? 1 / +vis.match(/every (\d+) months/)[1] : 0;
  const months = inv.startsWith('monthly') ? 1 : inv.startsWith('yearly') ? 12 : +(inv.match(/every (\d+) months/)?.[1] || 0);
  const per = visitsPerMonth && months ? Math.round(visitsPerMonth * months * 100) / 100 : 0;
  return { of, per, visits: b.visits || '', invoices: b.invoices || '' };
}
const perVisit = (f) => (f.per ? String(Math.round((f.of / f.per) * 100) / 100) : String(f.of));
const periodOf = (f) => (/^yearly/i.test(f.invoices) ? 'yr' : /^monthly/i.test(f.invoices) ? 'mo' : 'period');
function rowFromDraft(draft, people, week, crew, orgId, jobMinutes = {}) {
  const days = {};
  const dailyNp = {}; // pid -> minutes, summed over the days
  const dailyLights = {}; // pid -> Christmas lights minutes, summed over the days
  for (const [d, e] of Object.entries(draft.days)) {
    const r = num(e.revenue), c = num(e.cogs), m = parseTime(e.hours || '');
    if (m == null) throw new Error(`${fmtDay(d)}: crew hours should look like 16:30.`);
    const np = {};
    for (const [pid, v] of Object.entries(e.np || {})) {
      if (!v) continue;
      const nm = parseTime(v);
      if (nm == null) throw new Error(`${fmtDay(d)}: non-prod hours should look like 1:30.`);
      if (nm) { np[pid] = nm; dailyNp[pid] = (dailyNp[pid] || 0) + nm; }
    }
    const lights = {};
    for (const [pid, v] of Object.entries(e.lights || {})) {
      if (!v) continue;
      const lm = parseTime(v);
      if (lm == null) throw new Error(`${fmtDay(d)}: lights hours should look like 4:30.`);
      if (lm) { lights[pid] = lm; dailyLights[pid] = (dailyLights[pid] || 0) + lm; }
    }
    // Per-job lines are kept so the day's totals can be traced back; the day's
    // revenue/COGS are already their sums (see setDayJobs).
    const jobs = (e.jobs || []).filter((j) => j.name?.trim() || num(j.revenue) || num(j.cogs)).map((j) => ({ name: j.name.trim(), revenue: num(j.revenue), cogs: num(j.cogs), ...(j.jobberId ? { jobberId: j.jobberId } : {}), ...(j.split ? { split: j.split } : {}), ...(j.fixed ? { fixed: j.fixed } : {}) }));
    if (r || c || m || jobs.length || Object.keys(np).length || Object.keys(lights).length) days[d] = { revenue: r, cogs: c, prod_minutes: m, ...(jobs.length ? { jobs } : {}), ...(Object.keys(np).length ? { np_minutes: np } : {}), ...(Object.keys(lights).length ? { lights_minutes: lights } : {}) }; // per-day crew hours (all clocked time) are for the day breakdown only
  }
  const ppl = {};
  for (const p of people) {
    const h = draft.hours[p.id] || {}; const total = parseTime(h.total), np = p.id in dailyNp ? dailyNp[p.id] : parseTime(h.np);
    if (total == null || np == null) throw new Error(`${p.name}: hours should look like 7:30 (h:mm) or 7.5.`);
    const onJobs = jobMinutes[p.id] || 0, lights = dailyLights[p.id] || 0;
    if (lights && !total) throw new Error(`${p.name}: has lights hours but no total hours. Total should include the lights hours.`);
    if (total && np + onJobs + lights > total) throw new Error(`${p.name}: non-prod (${minutesToHMM(np)}) + on jobs (${minutesToHMM(onJobs)}) + lights (${minutesToHMM(lights)}) is more than total (${minutesToHMM(total)}).`);
    // Lawn production = total − non-prod − unfinished-job hours − Christmas lights hours (lights are paid on their own plan).
    const prod = Math.max(0, total - np - onJobs - lights);
    const extras = [
      ...(draft.extras || []).filter((x) => x.pid === p.id && (num(x.amount) || x.reason?.trim())).map((x) => ({ reason: x.reason.trim(), amount: num(x.amount) })),
      ...(draft.reviews || []).flatMap((r) => ['leader', 'helper'].filter((role) => r[role] === p.id).map((role) => ({ reason: reviewReason(role, r.client), amount: REVIEW_PAY[role], review: { id: r.id, role, client: r.client.trim() } }))),
    ];
    if (total || np || p.active || extras.length) ppl[p.id] = { total_minutes: total, prod_minutes: prod, np_minutes: np, ...(lights ? { lights_minutes: lights } : {}), rate: Number(p.hourly_rate) || 0, name: p.name, ...(extras.length ? { extras } : {}) };
  }
  return { org_id: orgId, week_ending: week, crew, days, people: ppl, employer_taxes: num(draft.taxes), notes: draft.notes?.trim() || null };
}
// Job draft: holds for this week are edited as h:mm strings; other weeks pass through.
function jobDraft(j, week, people) {
  const h = j.holds?.[week] || {};
  return { ...j, _hours: Object.fromEntries(people.map((p) => [p.id, h.people?.[p.id] ? minutesToHMM(h.people[p.id]) : ''])), _cogs: h.cogs ? String(h.cogs) : '', _paid: h.revenue ? String(h.revenue) : '', _done: j.done_week === week };
}
function jobFromDraft(d, week, people) {
  const ppl = {};
  for (const p of people) { const m = parseTime(d._hours[p.id]); if (m == null) throw new Error(`${d.name} / ${p.name}: hours should look like 7:30.`); if (m) ppl[p.id] = m; }
  const cogs = num(d._cogs), paid = num(d._paid);
  const holds = { ...(d.holds || {}) };
  if (Object.keys(ppl).length || cogs || paid) holds[week] = { people: ppl, cogs, revenue: paid }; else delete holds[week];
  const { _hours, _cogs, _paid, _done, ...rest } = d;
  return { ...rest, holds, done_week: d._done ? week : (d.done_week === week ? null : d.done_week) };
}

export default function WeeklyLog() {
  const { orgId } = useAuth();
  const nav = useNavigate();
  const { weekEnding: paramWeek } = useParams();
  const thisWeek = weekEndingFor(todayISO());
  const week = paramWeek && /^\d{4}-\d{2}-\d{2}$/.test(paramWeek) ? weekEndingFor(paramWeek) : thisWeek;

  const { members: people, setRate } = useTeamMembers();
  const [db, setDb] = useState(null); // { rows, jobs, settings }
  const [error, setError] = useState(null);
  const [crew, setCrew] = useState(DEFAULT_CREW);
  const [extraCrews, setExtraCrews] = useState([]);
  const [range, setRange] = useState('13');
  const [histMore, setHistMore] = useState(false);
  const [draft, setDraft] = useState(null);
  const [jobDrafts, setJobDrafts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [openDays, setOpenDays] = useState(() => new Set()); // days with the job list expanded
  const [pulling, setPulling] = useState(false);
  // Fixed-price recurring jobs in this week, by Jobber visit id, looked up as soon as the week opens
  // so their lines are flagged without pulling. Only flags: nothing in the week changes.
  const [fixedJobs, setFixedJobs] = useState({});
  // Jobber's job vs general clock time per day, from the same lookup. Shown under crew hours
  // for reference only: it isn't saved and doesn't feed any number on the page.
  const [dayTime, setDayTime] = useState({});
  useEffect(() => {
    let off = false; const wk = weekDays(week);
    setDayTime({});
    fetch(`/api/jobber-data?action=labor&start=${wk[0]}&end=${wk[6]}`).then((r) => (r.ok ? r.json() : {})).then((data) => {
      if (off) return;
      const m = {}, t = {};
      for (const d of Object.keys(data || {})) {
        for (const v of data[d]?.visits || []) { const f = fixedOf(v); if (f) m[v.id] = f; }
        const l = data[d]?.labor;
        if (l && (l.jobHours || l.generalHours)) t[d] = { job: Math.round((l.jobHours || 0) * 60), general: Math.round((l.generalHours || 0) * 60) };
      }
      setFixedJobs(m); setDayTime(t);
    }).catch(() => {});
    return () => { off = true; };
  }, [week]);

  const load = useCallback(() => {
    if (!orgId) return Promise.resolve();
    return Promise.all([
      supabase.from(T.log).select('*').eq('org_id', orgId).order('week_ending', { ascending: false }).then(ok),
      supabase.from(T.jobs).select('*').eq('org_id', orgId).order('opened_week').then(ok),
      supabase.from(T.settings).select('*').eq('org_id', orgId).maybeSingle().then(ok),
    ]).then(([rows, jobs, settings]) => { setDb({ rows, jobs, settings: settings || { target_pct: 30 } }); setError(null); }, (e) => setError(e.message));
  }, [orgId]);
  useEffect(() => { load(); }, [load]);
  // Plain /payroll opens on the week that still needs closing.
  useEffect(() => {
    if (db && !paramWeek) nav(`/payroll/${openWeekFor(db.rows, crew, thisWeek)}`, { replace: true });
  }, [db, paramWeek, crew, thisWeek, nav]);

  const activePeople = people;
  const targetPct = Number(db?.settings?.target_pct ?? 30);
  const crews = useMemo(() => [...new Set([DEFAULT_CREW, ...(db?.rows || []).map((r) => r.crew), ...(db?.jobs || []).map((j) => j.crew), ...extraCrews])], [db, extraCrews]);
  const current = useMemo(() => (db?.rows || []).find((r) => r.week_ending === week && r.crew === crew) || null, [db, week, crew]);
  const closed = !!current?.closed_at; // a closed week is read-only until reopened
  // Processing fee % (counted in COGS). Open weeks use the current setting; a closed week keeps the
  // rate it was saved with, so changing the setting never rewrites payroll that's already done.
  // hasFeeCol: the fee_pct columns exist (supabase/migrations/017); until then fees stay off.
  const hasFeeCol = !!db && ('fee_pct' in (db.settings || {}) || (db.rows || []).some((r) => 'fee_pct' in r));
  const defaultFee = hasFeeCol ? Number(db?.settings?.fee_pct ?? 0) : 0;
  const feeOf = useCallback((r) => (r?.closed_at ? Number(r.fee_pct ?? 0) : defaultFee), [defaultFee]);
  const feePct = feeOf(current);
  const weeksByEnding = useMemo(() => Object.fromEntries((db?.rows || []).filter((r) => r.crew === crew).map((r) => [r.week_ending, r])), [db, crew]);
  const crewJobs = useMemo(() => (db?.jobs || []).filter((j) => j.crew === crew && j.opened_week <= week && (!j.done_week || j.done_week >= week)), [db, crew, week]);

  // Reset drafts when the week/crew/saved data changes — not when the team
  // roster syncs (a rate edit mid-entry must not wipe what's typed).
  const peopleRef = useRef(people); peopleRef.current = people;
  const dirty = useRef(false);          // typed since the last save
  const shownFor = useRef(null);        // `${week}|${crew}` the drafts were built for
  const ownSave = useRef(false);        // the next reload is our own save — keep the form as is
  useEffect(() => {
    if (!db) return;
    const key = `${week}|${crew}`;
    // A reload after our own save must not rebuild the form: half-filled lines
    // (a review with no leader yet, a bonus with no amount) aren't saved, so
    // rebuilding from the saved row would drop them.
    if (shownFor.current === key && (dirty.current || ownSave.current)) { ownSave.current = false; return; }
    shownFor.current = key; dirty.current = false; ownSave.current = false;
    setDraft(draftFromRow(current, week, peopleRef.current));
    setJobDrafts(crewJobs.map((j) => jobDraft(j, week, peopleRef.current)));
  }, [db, current, week, crew, crewJobs]);
  // Roster changed: add rows for new people, keep everything already typed.
  useEffect(() => {
    setDraft((f) => f && { ...f, hours: { ...Object.fromEntries(people.map((p) => [p.id, { total: '', np: '' }])), ...f.hours } });
    setJobDrafts((js) => js.map((j) => ({ ...j, _hours: { ...Object.fromEntries(people.map((p) => [p.id, ''])), ...j._hours } })));
  }, [people]);
  useEffect(() => { setMsg(null); }, [week, crew]);

  // Live calc on the draft. If a time is unreadable, keep the last good result and show the error.
  const live = useMemo(() => {
    if (!db || !draft) return null;
    try {
      const jobs = jobDrafts.map((d) => jobFromDraft(d, week, people));
      const row = rowFromDraft(draft, people, week, crew, orgId, jobMinutesFrom(jobs, week));
      const weeks = { ...weeksByEnding, [week]: row };
      return { ok: true, calc: computeWeek({ weekEnding: week, row, weeks, people, jobs, targetPct, feePct }) };
    } catch (e) { return { ok: false, error: e.message }; }
  }, [db, draft, jobDrafts, people, week, crew, orgId, weeksByEnding, targetPct, feePct]);

  /* ─── writes ─── */
  const save = useCallback(async () => {
    if (!draft || busy || closed || shownFor.current !== `${week}|${crew}`) return; // draft belongs to another week — never cross-save; closed weeks never save
    setBusy(true); setMsg(null); dirty.current = false;
    try {
      const jobs = jobDrafts.map((d) => jobFromDraft(d, week, people));
      const row = rowFromDraft(draft, people, week, crew, orgId, jobMinutesFrom(jobs, week));
      const calc = computeWeek({ weekEnding: week, row, weeks: { ...weeksByEnding, [week]: row }, people, jobs, targetPct, feePct });
      const t = calc.totals;
      await supabase.from(T.log).upsert({ ...row, ...(hasFeeCol ? { fee_pct: feePct } : {}), revenue: calc.revenue, cogs: calc.cogs, payroll: t.wages, non_production_minutes: t.np_minutes, total_minutes: t.total_minutes, updated_at: new Date().toISOString() }, { onConflict: 'org_id,week_ending,crew' }).then(ok);
      for (const j of jobs) {
        const payload = { ...j, org_id: orgId, crew, updated_at: new Date().toISOString() };
        const isNew = payload.id?.startsWith('new-');
        if (isNew) delete payload.id;
        const saved = await supabase.from(T.jobs).upsert(payload).select().single().then(ok);
        if (isNew) setJobDrafts((js) => js.map((d) => (d.id === j.id ? { ...d, id: saved.id } : d))); // keep typing on the same card
      }
      ownSave.current = true;
      await load();
      setMsg({ ok: true, text: `Saved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` });
    } catch (e) { dirty.current = true; setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }, [draft, jobDrafts, busy, closed, week, crew, orgId, people, weeksByEnding, targetPct, feePct, hasFeeCol, load]);

  // Autosave: 1.5s after the last edit, if everything parses.
  useEffect(() => {
    if (!dirty.current || !live?.ok || busy) return;
    const id = setTimeout(save, 1500);
    return () => clearTimeout(id);
  }, [draft, jobDrafts, live, busy, save]);
  const remove = async () => {
    if (!current || !confirm(`Delete ${crew}'s entry for week ending ${fmtWeek(week)}? Jobs are kept.`)) return;
    setBusy(true);
    try { await supabase.from(T.log).delete().eq('id', current.id).then(ok); await load(); } finally { setBusy(false); }
  };
  // Close = payroll for this crew's week is done. Saves first, then jumps to the next open week.
  const setClosed = async (closed) => {
    setBusy(true); setMsg(null);
    try {
      await supabase.from(T.log).upsert({ org_id: orgId, week_ending: week, crew, closed_at: closed ? new Date().toISOString() : null }, { onConflict: 'org_id,week_ending,crew' }).then(ok);
      const rows = await supabase.from(T.log).select('*').eq('org_id', orgId).then(ok);
      await load();
      if (closed) nav(`/payroll/${openWeekFor(rows, crew, thisWeek)}`);
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };
  const saveTarget = async (v) => {
    const t = num(v); if (!t || t === targetPct) return;
    await supabase.from(T.settings).upsert({ org_id: orgId, target_pct: t, updated_at: new Date().toISOString() }, { onConflict: 'org_id' }).then(ok); await load();
  };
  const saveFee = async (v) => {
    const f = num(v); if (!hasFeeCol || f < 0 || f === defaultFee) return;
    await supabase.from(T.settings).upsert({ org_id: orgId, target_pct: targetPct, fee_pct: f, updated_at: new Date().toISOString() }, { onConflict: 'org_id' }).then(ok); await load();
  };
  const addCrew = () => { const name = prompt('Crew name (e.g. "Crew 2")')?.trim(); if (!name || crews.includes(name)) return; setExtraCrews((c) => [...c, name]); setCrew(name); };

  /* ─── draft edits ─── */
  const touch = () => { dirty.current = true; };
  const setDay = (d, k) => (e) => { touch(); setDraft((f) => ({ ...f, days: { ...f.days, [d]: { ...EMPTY_DAY, ...f.days[d], [k]: e.target.value } } })); };
  const setHours = (pid, k) => (e) => { touch(); setDraft((f) => ({ ...f, hours: { ...f.hours, [pid]: { ...f.hours[pid], [k]: e.target.value } } })); };
  // A day with job lines gets its revenue and COGS from them — no adding up by hand.
  const setDayJobs = (d, fn) => { touch(); setDraft((f) => {
    const day = { ...EMPTY_DAY, ...f.days[d] };
    const jobs = fn(day.jobs || []);
    const sum = (k) => { const t = jobs.reduce((a, j) => a + num(j[k]), 0); return t ? String(num(t)) : ''; };
    return { ...f, days: { ...f.days, [d]: { ...day, jobs, revenue: sum('revenue'), cogs: sum('cogs') } } };
  }); };
  // Fill from Jobber: each day's job lines (visits) and total crew hours (all
  // timesheets); a whole-week pull also fills each person's total hours.
  // Only blanks get filled — job lines you've already got and anything you've
  // typed are kept; new lines dedupe on the Jobber visit id.
  const pullFromJobber = async (only) => {
    setPulling(only || 'week'); setMsg(null);
    try {
      const wk = weekDays(week);
      const r = await fetch(`/api/jobber-data?action=labor&start=${wk[0]}&end=${wk[6]}`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Jobber returned ${r.status}`);
      let added = 0, hoursFilled = 0, lightsFilled = 0;
      // Match a Jobber name to the team (full name, then first name).
      const norm = (x) => (x || '').trim().toLowerCase();
      const personFor = (n) => people.find((x) => norm(x.name) === norm(n)) || people.find((x) => norm(x.name).split(' ')[0] === norm(n).split(' ')[0]);
      const kept = [];
      const opened = [];
      for (const d of only ? [only] : wk) {
        const crewMin = Math.round((data[d]?.labor?.totalHours || 0) * 60);
        if (crewMin && !draft.days[d]?.hours) { setDay(d, 'hours')({ target: { value: minutesToHMM(crewMin) } }); hoursFilled++; }
        const visits = data[d]?.visits || [];
        if (!visits.length) continue;
        // A lights-only day: everyone's whole clocked time that day (job + general: loading, driving,
        // cleanup) is lights time. Mixed lawn + lights days are typed by hand — Jobber can't split them.
        if (visits.every((v) => isLightsJob(v.title))) {
          for (const [n, v] of Object.entries(data[d]?.labor?.byPerson || {})) {
            const p = personFor(n), m = Math.round((v.hours || 0) * 60);
            if (p && m && !draft.days[d]?.lights?.[p.id]) { setDayLights(d, p.id)({ target: { value: minutesToHMM(m) } }); lightsFilled++; }
          }
        }
        // Typed totals with no job lines: adding lines would replace them with the lines' sum.
        const cur = draft.days[d] || EMPTY_DAY;
        if (!cur.jobs?.length && (cur.revenue || cur.cogs)) { kept.push(fmtDay(d)); continue; }
        const have = new Set((draft.days[d]?.jobs || []).map((j) => j.jobberId).filter(Boolean));
        const fresh = visits.filter((v) => !have.has(v.id)).map((v) => ({
          jobberId: v.id,
          // Our visit titles already carry the client ("Jane Doe - Lawn"), so use them as is.
          name: v.title?.trim() || (v.client !== 'Unknown' ? v.client : '') || '',
          revenue: fixedOf(v) ? perVisit(fixedOf(v)) : v.jobTotal ? String(num(v.jobTotal)) : '',
          cogs: v.jobExpenses ? String(num(v.jobExpenses)) : '',
          ...(splitOf(v) ? { split: splitOf(v) } : {}),
          ...(fixedOf(v) ? { fixed: fixedOf(v) } : {}),
        }));
        opened.push(d);
        const byId = Object.fromEntries(visits.map((v) => [v.id, v]));
        const retag = (cur.jobs || []).some((j) => byId[j.jobberId] && ((!j.split && splitOf(byId[j.jobberId])) || (!j.fixed && fixedOf(byId[j.jobberId]))));
        if (!fresh.length && !retag) continue;
        added += fresh.length;
        // Dedupe again inside the updater in case the draft moved on meanwhile.
        setDayJobs(d, (js) => {
          const tagged = js.map((j) => {
            const v = byId[j.jobberId]; if (!v) return j;
            const sp = !j.split && splitOf(v); let out = sp ? { ...j, split: sp } : j;
            // Already-pulled fixed-price jobs: tag them, and swap in the per-visit price only if the
            // line still shows the full period price (so anything you typed yourself is left alone).
            const fx = !j.fixed && fixedOf(v);
            if (fx) out = { ...out, fixed: fx, ...(num(j.revenue) === fx.of && fx.per ? { revenue: perVisit(fx) } : {}) };
            return out;
          });
          const ids = new Set(tagged.map((j) => j.jobberId));
          return [...tagged, ...fresh.filter((f) => !ids.has(f.jobberId))];
        });
      }
      setOpenDays((s) => new Set([...s, ...opened]));

      // Each person's week total, matched to the team by name (full, then first).
      let peopleFilled = 0;
      const unmatched = [];
      if (!only) {
        const byName = {};
        for (const d of wk) for (const [n, v] of Object.entries(data[d]?.labor?.byPerson || {})) byName[n] = (byName[n] || 0) + (v.hours || 0);
        for (const [n, hrs] of Object.entries(byName)) {
          const p = personFor(n);
          const m = Math.round(hrs * 60);
          if (!p) { if (m) unmatched.push(n); continue; }
          if (m && !draft.hours[p.id]?.total) { setHours(p.id, 'total')({ target: { value: minutesToHMM(m) } }); peopleFilled++; }
        }
      }

      const got = [
        added && `${added} visit${added === 1 ? '' : 's'}`,
        hoursFilled && `crew hours for ${hoursFilled} day${hoursFilled === 1 ? '' : 's'}`,
        lightsFilled && `Christmas lights hours (${lightsFilled})`,
        peopleFilled && `total hours for ${peopleFilled} ${peopleFilled === 1 ? 'person' : 'people'}`,
      ].filter(Boolean);
      const what = only ? fmtDay(only) : 'this week';
      setMsg({ ok: true, text: (got.length ? `Pulled ${got.join(', ')} from Jobber. Check fixed-price jobs and non-prod hours, then Save week.` : `Nothing new in Jobber for ${what}.`) + (unmatched.length ? ` Not on the Team page, so skipped: ${unmatched.join(', ')}.` : '') + (kept.length ? ` Left your typed totals alone on ${kept.join(', ')}.` : '') });
    } catch (e) {
      setMsg({ ok: false, text: `Couldn't pull from Jobber: ${e.message}` });
    } finally {
      setPulling(false);
    }
  };
  const toggleDay = (d) => setOpenDays((s) => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n; });
  const setDayLights = (d, pid) => (e) => { touch(); setDraft((f) => ({ ...f, days: { ...f.days, [d]: { ...EMPTY_DAY, ...f.days[d], lights: { ...(f.days[d]?.lights || {}), [pid]: e.target.value } } } })); };
  const setDayNp = (d, pid) => (e) => { touch(); setDraft((f) => ({ ...f, days: { ...f.days, [d]: { ...EMPTY_DAY, ...f.days[d], np: { ...(f.days[d]?.np || {}), [pid]: e.target.value } } } })); };
  const setReviews = (fn) => { touch(); setDraft((f) => ({ ...f, reviews: fn(f.reviews || []) })); };
  const setExtras = (fn) => { touch(); setDraft((f) => ({ ...f, extras: fn(f.extras || []) })); };
  const setField = (k) => (e) => { touch(); setDraft((f) => ({ ...f, [k]: e.target.value })); };

  /* ─── history (all crews, computed the same way) ─── */
  const history = useMemo(() => {
    if (!db) return [];
    const byWeek = {};
    for (const r of db.rows) (byWeek[r.week_ending] ||= []).push(r);
    for (const j of db.jobs) if (j.done_week) (byWeek[j.done_week] ||= []);
    // Finished weeks only, with no gaps: a week you haven't logged yet still shows (as Open).
    const logged = Object.keys(byWeek).filter((w) => w < thisWeek).sort();
    if (logged.length) for (let w = logged[0]; w < thisWeek; w = addDaysISO(w, 7)) byWeek[w] ||= [];
    let weeks = Object.keys(byWeek).filter((w) => w < thisWeek).sort().reverse();
    if (range !== 'all') weeks = weeks.filter((w) => w > addDaysISO(thisWeek, -7 * Number(range)));
    return weeks.map((w) => {
      const crewsHere = [...new Set([...(byWeek[w] || []).map((r) => r.crew), ...db.jobs.filter((j) => j.done_week === w).map((j) => j.crew)])];
      const calcs = crewsHere.map((c) => computeWeek({ weekEnding: w, row: db.rows.find((r) => r.week_ending === w && r.crew === c) || null,
        weeks: Object.fromEntries(db.rows.filter((r) => r.crew === c).map((r) => [r.week_ending, r])), people, jobs: db.jobs.filter((j) => j.crew === c), targetPct, feePct: feeOf(db.rows.find((r) => r.week_ending === w && r.crew === c)) }));
      const s = (f) => calcs.reduce((a, c) => a + f(c), 0);
      // Lawn columns leave Christmas lights out, so labor % stays comparable to the target and to past weeks.
      const revenue = s((c) => c.totals.lawn_revenue), cogs = s((c) => c.totals.lawn_cogs), prodWages = s((c) => c.totals.lawn_prod_wages);
      const lightsRevenue = s((c) => c.totals.lights_revenue), lightsLabor = s((c) => c.totals.lights_labor);
      const rowsHere = byWeek[w] || [];
      // Lawn %: lawn production wages + lawn bonus (weekly + finished jobs) ÷ lawn adjusted revenue (money in − COGS),
      // the same base the lawn bonus uses. Non-prod, lights and review/extra bonuses left out.
      const lawnIn = s((c) => c.totals.lawn_revenue - c.totals.lawn_cogs), lawnCrewPay = s((c) => c.totals.lawn_prod_wages + c.totals.week_bonus + c.totals.job_bonus);
      const lawnWages = s((c) => c.totals.lawn_prod_wages);
      return { lawnCrew: lawnIn > 0 ? lawnCrewPay / lawnIn : null, lawnBefore: lawnIn > 0 ? lawnWages / lawnIn : null, lawnWages, lawnBonus: s((c) => c.totals.week_bonus + c.totals.job_bonus), otherBonus: s((c) => c.totals.extra_bonus), lightsBonus: s((c) => c.totals.lights_bonus + c.totals.lead_bonus), week_ending: w, crews: crewsHere.length, closed: rowsHere.length > 0 && rowsHere.every((r) => r.closed_at), revenue, cogs, margin: revenue - cogs, prodWages, laborPct: revenue - cogs > 0 ? prodWages / (revenue - cogs) : null,
        allRevenue: s((c) => c.totals.revenue), allCogs: s((c) => c.totals.cogs), lightsRevenue, lightsLabor,
        // Lawn labor % the crew controls: all wages + bonuses, minus non-prod (work you assign) and minus everything
        // lights (its own % in the lights column), ÷ lawn money in.
        lawnCrewPay: s((c) => c.totals.lawn_prod_wages + c.totals.week_bonus + c.totals.job_bonus),
        lawnIn: s((c) => c.totals.lawn_revenue - c.totals.lawn_cogs),
        npWages: s((c) => c.totals.np_wages),
        allMin: s((c) => c.totals.total_minutes), prodAll: s((c) => c.totals.prod_minutes + c.totals.lights_minutes),
        lightsInstall: s((c) => c.totals.lights_install), lightsInstallLabor: s((c) => c.totals.lights_install_labor), lightsRemovalLabor: s((c) => c.totals.lights_removal_labor),
        wages: s((c) => c.totals.wages), taxes: s((c) => c.totals.employer_taxes), bonus: s((c) => c.totals.bonus), prod: s((c) => c.totals.prod_minutes), np: s((c) => c.totals.np_minutes), jobMin: s((c) => c.totals.job_minutes) };
    });
  }, [db, range, thisWeek, people, targetPct, feeOf]);
  const hTotals = useMemo(() => {
    const keys = ['revenue', 'cogs', 'prodWages', 'wages', 'taxes', 'bonus', 'prod', 'np', 'jobMin', 'allRevenue', 'allCogs', 'lightsRevenue', 'lightsLabor', 'lightsInstall', 'lightsInstallLabor', 'lightsRemovalLabor', 'allMin', 'prodAll', 'npWages', 'lawnCrewPay', 'lawnIn', 'lawnWages', 'lawnBonus', 'lightsBonus', 'otherBonus'];
    const t = history.reduce((a, h) => Object.fromEntries(keys.map((k) => [k, a[k] + (h[k] || 0)])), Object.fromEntries(keys.map((k) => [k, 0])));
    return { ...t, lawnCrew: t.lawnIn > 0 ? t.lawnCrewPay / t.lawnIn : null, lawnBefore: t.lawnIn > 0 ? t.lawnWages / t.lawnIn : null, margin: t.revenue - t.cogs, laborPct: t.revenue - t.cogs > 0 ? t.prodWages / (t.revenue - t.cogs) : null };
  }, [history]);

  // Christmas lights season: Jul 1 → Jun 30, every crew, whatever range the table shows.
  // Install labor % = install-day pay ÷ install value; removal % = removal pay ÷ the season's install value.
  const lightsSeason = useMemo(() => {
    if (!db) return null;
    const y = Number(thisWeek.slice(0, 4)), start = Number(thisWeek.slice(5, 7)) >= 7 ? `${y}-07-01` : `${y - 1}-07-01`;
    const rows = db.rows.filter((r) => r.week_ending >= start && r.week_ending >= LIGHTS_PLAN_FROM);
    let install = 0, installLabor = 0, removalLabor = 0;
    for (const r of rows) {
      const c = computeWeek({ weekEnding: r.week_ending, row: r, weeks: Object.fromEntries(db.rows.filter((x) => x.crew === r.crew).map((x) => [x.week_ending, x])), people, jobs: [], targetPct, feePct: feeOf(r) });
      install += c.totals.lights_install; installLabor += c.totals.lights_install_labor; removalLabor += c.totals.lights_removal_labor;
    }
    return install || installLabor || removalLabor ? { install, installLabor, removalLabor } : null;
  }, [db, thisWeek, people, targetPct, feeOf]);
  const rphOf = (h) => (h.prodAll > 0 && h.allRevenue ? h.allRevenue / (h.prodAll / 60) : null);
  const showLights = !!lightsSeason || history.some((h) => h.lightsRevenue > 0);
  const pctTag = (pct, target) => <span className={`font-semibold ${pct <= target ? 'text-[#4d7c0f]' : 'text-amber-700'}`}>{(pct * 100).toFixed(0)}%</span>;

  // Rev/hr goal: typed (kept on this device), else average crew pay ÷ labor target, rounded to $5.
  const [goalIn, setGoalIn] = useState(() => localStorage.getItem(GOAL_KEY) || '');
  const crewRates = people.filter((p) => !PAID_BY_DRAW.has(p.id) && Number(p.hourly_rate) > 0).map((p) => Number(p.hourly_rate));
  const autoGoal = crewRates.length && targetPct > 0 ? Math.round(crewRates.reduce((a, r) => a + r, 0) / crewRates.length / (targetPct / 100) / 5) * 5 : 0;
  const goal = num(goalIn) || autoGoal || 0;
  // Labor goal for the grade: crew pay (all wages + all bonuses, lights included) as a % of money in. This device only.
  const [laborGoalIn, setLaborGoalIn] = useState(() => localStorage.getItem(LABOR_GOAL_KEY) || '');
  const laborGoal = num(laborGoalIn) || DEFAULT_LABOR_GOAL;
  // "Are we doing good?" — two goals you set: labor % (all crew pay ÷ money in) at/under the labor goal, and rev per production hour at/over the goal.
  // Both = Good, one = Okay, neither = Rough.
  const gradeOf = (laborPct, rph) => {
    const checks = [
      { ok: laborPct != null && laborPct <= laborGoal / 100 + 0.0005, text: `lawn labor ${pctFmt(laborPct)} (goal ${laborGoal}% or less)`, known: laborPct != null },
      { ok: rph != null && goal > 0 && rph >= goal, text: `${rph == null ? '—' : fmt0(rph)}/man-hr (goal ${fmt0(goal)})`, known: rph != null && goal > 0 },
    ].filter((c) => c.known);
    if (!checks.length) return null;
    const n = checks.filter((c) => c.ok).length;
    const level = n === checks.length ? 'good' : n === 0 ? 'bad' : 'ok';
    return { level, checks, label: level === 'good' ? 'Good' : level === 'bad' ? 'Rough' : 'Okay' };
  };
  const GRADE_STYLE = { good: 'bg-emerald-100 text-emerald-800', ok: 'bg-amber-100 text-amber-800', bad: 'bg-red-100 text-red-700' };

  if (error) return <div className="p-6 text-red-700">Weekly log failed to load: {error}. Have migrations 009–015 been applied?</div>;
  if (!db || !draft) return <div className="flex items-center gap-2 p-6 text-slate-500"><Loader2 className="animate-spin" size={18} /> Loading…</div>;

  const calc = live.ok ? live.calc : null;
  const t = calc?.totals;
  // We don't work Sundays: hide that row unless it already has something on it.
  const days = weekDays(week).filter((d, i) => {
    if (i > 0) return true;
    const e = draft.days[d];
    return !!(e && (e.revenue || e.cogs || e.hours || e.jobs?.length));
  });

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#4d7c0f]">Hey Jude's</div>
          <h1 className="text-2xl font-black">Payroll &amp; Bonuses</h1>
          <p className="text-sm text-slate-500">Money in + COGS per day, hours and pay per person, bonuses. Weeks end Saturday.</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <label className="text-xs text-slate-500">Labor target <input className="ml-1 w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums" defaultValue={targetPct} onBlur={(e) => saveTarget(e.target.value)} />%</label>
          <label className="text-xs text-slate-500" title={hasFeeCol ? 'Card/processing fees, as a % of finished revenue. Counted in COGS so margin and the bonus pool leave them out. Closed weeks keep the rate they were saved with.' : 'Needs the database update (supabase/migrations/017_weekly_log_processing_fee.sql) before it can be saved.'}>Processing fees <input key={defaultFee} disabled={!hasFeeCol} className="ml-1 w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums disabled:bg-slate-100" inputMode="decimal" defaultValue={defaultFee} onBlur={(e) => saveFee(e.target.value)} />%</label>
          <label className="text-xs text-slate-500" title="Lawn labor % = lawn wages + lawn bonuses ÷ lawn money in. Non-prod, Christmas lights and employer taxes left out (lights have their own 14% goal). Grades each week Good/Okay/Rough with the rev/hr goal. Saved on this device only.">Lawn labor goal <input className="ml-1 w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums" inputMode="decimal" placeholder={String(DEFAULT_LABOR_GOAL)} value={laborGoalIn} onChange={(e) => { setLaborGoalIn(e.target.value); localStorage.setItem(LABOR_GOAL_KEY, e.target.value); }} />%</label>
          <label className="text-xs text-slate-500" title={`Colors each day's rev/hr: green at or above the goal, amber within 20%, red below that. Leave blank to use average crew pay ÷ labor target${autoGoal ? ` (${fmt0(autoGoal)}/hr)` : ''}. Saved on this device only.`}>Rev/man-hr goal <span className="ml-1">$</span><input className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums" inputMode="decimal" placeholder={autoGoal ? String(autoGoal) : '—'} value={goalIn} onChange={(e) => { setGoalIn(e.target.value); localStorage.setItem(GOAL_KEY, e.target.value); }} />/hr</label>
        </div>
      </div>

      {/* week picker */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => nav(`/payroll/${addDaysISO(week, -7)}`)} className="rounded-lg border p-2 hover:bg-slate-50" aria-label="Previous week"><ChevronLeft size={18} /></button>
        <div className="text-xl font-black">Week ending {fmtWeek(week)}</div>
        <button onClick={() => nav(`/payroll/${addDaysISO(week, 7)}`)} className="rounded-lg border p-2 hover:bg-slate-50" aria-label="Next week"><ChevronRight size={18} /></button>
        {week !== thisWeek && <Link to={`/payroll/${thisWeek}`} className="text-sm text-[#4d7c0f] hover:underline">This week</Link>}
        {current?.closed_at
          ? <span className="inline-flex items-center gap-2 rounded-full bg-[#B0FF03]/30 px-2.5 py-0.5 text-xs font-semibold text-[#3f6212]">Closed {new Date(current.closed_at).toLocaleDateString()}<button onClick={() => setClosed(false)} disabled={busy} className="font-normal text-slate-600 underline hover:text-slate-900">Reopen</button></span>
          : null}
        {week > thisWeek && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Future week</span>}
        <button onClick={() => pullFromJobber()} disabled={!!pulling || !draft || closed} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
          {pulling === 'week' && <Loader2 size={14} className="animate-spin" />} Pull week from Jobber
        </button>
        {current && <span className="text-xs text-slate-400">last saved {new Date(current.updated_at).toLocaleString()}</span>}
      </div>

      {/* crew tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-1 border-b">
        {crews.map((c) => (
          <button key={c} onClick={() => setCrew(c)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${crew === c ? 'border-[#4d7c0f] text-[#4d7c0f]' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
            {c}{db.rows.some((r) => r.week_ending === week && r.crew === c) && <span className="ml-1 text-[10px] text-slate-400">●</span>}
          </button>
        ))}
        <button onClick={addCrew} className="ml-1 flex items-center gap-1 px-2 py-2 text-xs text-slate-500 hover:text-slate-900"><Plus size={14} /> crew</button>
      </div>

      <div className="space-y-5">
        {/* Closed weeks: everything below is read-only (the browser disables every control in the fieldset). */}
        <fieldset disabled={closed} className="min-w-0 space-y-5" onKeyDown={arrowNav}>
        {closed && <p className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm text-slate-600">This week is closed, so it can't be edited. <b>Reopen</b> it at the top to make changes.</p>}
        {/* 1. this week: money per day + hours per person */}
        <section className="rounded-xl border bg-white">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div><h3 className="font-bold">1. This week</h3><p className="text-xs text-slate-500">Money in + COGS by day for <b>finished</b> work; each person's total and non-prod hours — production is what's left. Skip days with nothing.</p></div>
            <Link to="/team" className="text-sm font-semibold text-[#4d7c0f] hover:underline">People &amp; rates come from Team →</Link>
          </header>
          {/* Days and people stack at every width: side by side, both tables were too wide for their half and got cut off. */}
          <div>
            {(() => {
              const today = todayISO();
              // Rev/hr is on production hours: the day's crew hours minus that day's non-prod (shop, errands, Jude's house).
              const stats = days.map((d) => { const e = draft.days[d] || EMPTY_DAY; const rev = num(e.revenue), cg = num(e.cogs), min = parseTime(e.hours || '') || 0;
                const np = Math.min(min, Object.values(e.np || {}).reduce((x, v) => x + (parseTime(v || '') || 0), 0)), prod = min - np;
                return { d, e, rev, cogs: cg, min, np, prod, rph: prod > 0 && rev ? rev / (prod / 60) : null, jobs: e.jobs || [] }; });
              const wkMin = stats.reduce((x, y) => x + y.min, 0), wkNp = stats.reduce((x, y) => x + y.np, 0), wkProd = wkMin - wkNp, wkRev = calc?.revenue ?? stats.reduce((x, y) => x + y.rev, 0), wkCogs = calc?.cogs ?? stats.reduce((x, y) => x + y.cogs, 0);
              const wkRph = wkProd > 0 && wkRev ? wkRev / (wkProd / 60) : null, wkTone = TONES[toneOf(wkRph, goal)];
              const jump = (d) => (ev) => { ev.preventDefault(); document.getElementById(`day-${d}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
              return (
                <div className="border-b">
                  {/* the week at a glance: one tile per day, colored by rev/hr — click to jump to that day */}
                  <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4 lg:grid-cols-7">
                    {stats.map((x) => { const tn = TONES[toneOf(x.rph, goal)]; return (
                      <a key={x.d} href={`#day-${x.d}`} onClick={jump(x.d)} className={`rounded-lg border p-2.5 transition hover:-translate-y-0.5 hover:shadow-md ${tn.box} ${x.d === today ? 'ring-2 ring-[#B0FF03]' : ''}`}>
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-slate-500">{weekdayOf(x.d, 'short')}<span className={`h-2 w-2 rounded-full ${tn.bar}`} /></div>
                        <div className={`mt-0.5 text-lg font-black tabular-nums ${tn.text}`}>{x.rph == null ? '—' : fmt0(x.rph)}<span className="text-[10px] font-semibold text-slate-400">{x.rph == null ? '' : '/hr'}</span></div>
                        <div className="truncate text-[11px] tabular-nums text-slate-500">{x.rev ? fmt0(x.rev) : 'no work'}{x.prod ? ` · ${minutesToDecimal(x.prod)}h` : ''}</div>
                      </a>
                    ); })}
                    <div className="rounded-lg bg-slate-900 p-2.5 text-white">
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-slate-400">Week<span className={`h-2 w-2 rounded-full ${wkTone.bar}`} /></div>
                      <div className="mt-0.5 text-lg font-black tabular-nums">{wkRph == null ? '—' : fmt0(wkRph)}<span className="text-[10px] font-semibold text-slate-400">{wkRph == null ? '' : '/hr'}</span></div>
                      <div className="truncate text-[11px] tabular-nums text-slate-400">{fmt0(wkRev)} · {wkProd ? `${minutesToDecimal(wkProd)}h` : '0h'}</div>
                      <div className="text-[11px] font-semibold text-slate-300">{wkTone.label}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-3 text-[11px] text-slate-500">
                    <span title="Rev/hr = revenue ÷ production hours (non-prod left out). Green at or above the goal, amber within 20%, red more than 20% under.">Goal <b className="tabular-nums text-slate-700">{goal ? `${fmt0(goal)}/hr` : 'not set'}</b></span>
                    {['good', 'ok', 'bad'].map((k) => <span key={k} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${TONES[k].bar}`} />{TONES[k].label}</span>)}
                  </div>

                  {/* one card per day: entries on the left, the end-of-day score on the right */}
                  <div className="space-y-3 px-4 pb-4">
                    {stats.map(({ d, e, rev, min, np, prod, rph, jobs }) => {
                      const open = openDays.has(d); const fromJobs = jobs.length > 0; const tn = TONES[toneOf(rph, goal)];
                      return (
                        <div key={d} id={`day-${d}`} className={`scroll-mt-24 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${d === today ? 'ring-2 ring-[#B0FF03]' : ''}`}>
                          <div className={`h-1 ${tn.bar}`} />
                          <div className="flex flex-col gap-3 p-3 md:flex-row md:items-stretch">
                            <div className="shrink-0 md:w-40">
                              <div className="flex items-baseline gap-2"><span className="text-lg font-black">{weekdayOf(d)}</span><span className="text-sm text-slate-500">{monthDayOf(d)}</span></div>
                              {d === today && <span className="mt-0.5 inline-block rounded-full bg-[#B0FF03] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-900">Today</span>}
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {/* A span, not a button: a closed week's fieldset disables buttons, and you should still be able to see its jobs. */}
                                <span role="button" tabIndex={0} aria-expanded={open} onClick={() => toggleDay(d)} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleDay(d); } }} className="inline-flex cursor-pointer select-none items-center gap-0.5 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-[#4d7c0f] hover:bg-slate-50">
                                  {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{jobs.length ? `${jobs.length} job${jobs.length === 1 ? '' : 's'}` : 'Jobs'}
                                </span>
                                <button onClick={() => pullFromJobber(d)} disabled={!!pulling} title={`Pull ${fmtDay(d)} from Jobber`} className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50">
                                  {pulling === d ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}Pull
                                </button>
                              </div>
                            </div>
                            {/* With job lines the day totals are their sums, so they're read-only here. */}
                            <div className="grid flex-1 grid-cols-1 content-start gap-2 sm:grid-cols-3">
                              <div><div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Revenue</div><input className={`${cell} ${fromJobs ? 'bg-slate-50 text-slate-600' : ''}`} inputMode="decimal" placeholder="—" value={e.revenue} readOnly={fromJobs} title={fromJobs ? 'Sum of the jobs below' : undefined} onChange={setDay(d, 'revenue')} /></div>
                              <div><div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">COGS</div><input className={`${cell} ${fromJobs ? 'bg-slate-50 text-slate-600' : ''}`} inputMode="decimal" placeholder="—" value={e.cogs} readOnly={fromJobs} title={fromJobs ? 'Sum of the jobs below' : undefined} onChange={setDay(d, 'cogs')} /></div>
                              <div title={dayTime[d] ? `Jobber clock: job ${minutesToHMM(dayTime[d].job)} · general ${minutesToHMM(dayTime[d].general)} (reference only)` : undefined}><div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Crew hrs</div><TimeCell value={e.hours || ''} onChange={setDay(d, 'hours')} /></div>
                              {min > 0 && <div className="text-xs text-slate-500 sm:col-span-3">
                                {/* Non-prod is typed per person in the day's details; click to open them. */}
                                <span role="button" tabIndex={0} onClick={() => { if (!open) toggleDay(d); }} onKeyDown={(ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && !open) { ev.preventDefault(); toggleDay(d); } }} className={`cursor-pointer hover:underline ${np ? 'font-semibold text-amber-700' : ''}`}>Non-prod {minutesToHMM(np)}</span>
                                <span className="mx-1.5 text-slate-300">·</span>Production <b className="text-[#4d7c0f]">{minutesToHMM(prod)}</b>
                              </div>}
                            </div>
                            <EndOfDay rph={rph} rev={rev} min={min} goal={goal} />
                          </div>
                          {(() => { const L = calc?.lights?.days.find((x) => x.date === d); if (!L) return null;
                            return (
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-red-200 bg-red-50/70 px-3 py-2 text-xs text-slate-700">
                                <span className="font-bold text-[#B3121F]">🎄 Lights</span>
                                <span>{fmt(L.install)} installed ·</span>
                                <span>{L.pool > 0 ? <>crew bonus <b>{fmt(L.pool)}</b> ({(L.pct * 100).toFixed(0)}%)</> : 'no crew bonus (under $2,000)'}</span>
                                {L.lead > 0 && <span>· Ethan <b>+{fmt(L.lead)}</b></span>}
                                {L.warnings.map((w) => <span key={w} className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">{w}</span>)}
                              </div>
                            ); })()}
                          {open && (
                            <div className="border-t border-slate-200 bg-slate-50/60 px-3 pb-3 pt-2">
                      <div className="space-y-1.5">
                        {jobs.map((j, i) => (
                          <div key={i} className="grid grid-cols-[minmax(0,1fr)_8rem_8rem_10rem_7rem] items-center">
                            <div className="relative ml-auto w-full max-w-md pr-2">
                              <input className={`${cell.replace('text-right', 'text-left')} ${j.split ? 'pr-36' : ''}`} placeholder="Job / client" value={j.name} onChange={(ev) => setDayJobs(d, (js) => js.map((x, k) => (k === i ? { ...x, name: ev.target.value } : x)))} />
                              {j.split && <span title={`One-off job worked over more than one day. Its ${fmt(j.split.of)} price is split across those days by hours; this day's share is the revenue here.`} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">part of {fmt0(j.split.of)}</span>}
                            </div>
                            <div className="px-2"><input className={`${cell} ${j.split ? 'border-amber-300 bg-amber-50' : (j.fixed || fixedJobs[j.jobberId]) ? (num(j.revenue) === (j.fixed || fixedJobs[j.jobberId]).of ? 'border-red-400 bg-red-50' : 'border-sky-300 bg-sky-50') : ''}`} inputMode="decimal" placeholder="Revenue" value={j.revenue} onChange={(ev) => setDayJobs(d, (js) => js.map((x, k) => (k === i ? { ...x, revenue: ev.target.value } : x)))} /></div>
                            <div className="px-2"><input className={cell} inputMode="decimal" placeholder="COGS" value={j.cogs} onChange={(ev) => setDayJobs(d, (js) => js.map((x, k) => (k === i ? { ...x, cogs: ev.target.value } : x)))} /></div>
                            {/* Trash, then the fixed-price flag in the empty space to the right. */}
                            <div className="col-span-2 flex items-center gap-2">
                              <button onClick={() => setDayJobs(d, (js) => js.filter((_, k) => k !== i))} className="rounded p-1 text-slate-400 hover:text-red-600" aria-label="Remove job"><Trash2 size={14} /></button
>                              {isLightsJob(j.name) && <span title={isLightsInstall(j.name) ? 'Christmas lights install: left out of the lawn bonus, counts toward the daily lights bonus.' : 'Christmas lights takedown/service: left out of the lawn bonus, paid hourly only (no lights bonus).'} className="whitespace-nowrap rounded-full bg-[#B3121F] px-2 py-0.5 text-[11px] font-semibold text-white">{isLightsInstall(j.name) ? '🎄 lights' : '🎄 hourly only'}</span>}                              {(() => { const fx = j.fixed || fixedJobs[j.jobberId]; if (!fx) return null; const full = fx.per && num(j.revenue) === fx.of;
                                return <span title={fx.per ? `Fixed price: ${fmt(fx.of)} billed ${fx.invoices.toLowerCase()}, visits ${fx.visits.toLowerCase()}. That's about ${fx.per} visits per bill, so each visit is worth ${fmt(fx.of / fx.per)}.${full ? ' This line still has the full price: change it to the per-visit amount.' : ''} Type over it if this client's real visit count is different.` : `Fixed price: ${fmt(fx.of)} per bill, but the visit schedule couldn't be read. Divide by the visits it covers and type the per-visit amount.`}
                                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${!fx.per || full ? 'bg-red-100 text-red-700' : 'bg-sky-100 text-sky-800'}`}>
                                  {!fx.per ? `fixed ${fmt(fx.of)} · divide me` : `fixed ${fmt(fx.of)}/${periodOf(fx)} ÷ ${fx.per} = ${fmt(fx.of / fx.per)}`}</span>; })()}
                            </div>
                          </div>
                        ))}
                        <button onClick={() => setDayJobs(d, (js) => [...js, { name: '', revenue: '', cogs: '' }])} className="inline-flex items-center gap-1 text-xs font-semibold text-[#4d7c0f] hover:underline"><Plus size={13} /> Add job</button>
                      </div>
                      {activePeople.length > 0 && (jobs.some((j) => isLightsJob(j.name)) || Object.values(e.lights || {}).some(Boolean)) && (
                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50/60 p-2">
                          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#B3121F]" title="Each person's lights time this day (also inside their total). Pull fills it on a lights-only day; type it on a lawn + lights day.">🎄 Lights hours</div>
                          <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                            {activePeople.map((p) => (
                              <div key={p.id} className="flex items-center gap-2"><span className="w-28 shrink-0 truncate text-sm">{p.name}</span><div className="w-36"><TimeCell value={e.lights?.[p.id] || ''} onChange={setDayLights(d, p.id)} /></div></div>
                            ))}
                          </div>
                        </div>
                      )}
                      {activePeople.length > 0 && (
                        <div className="mt-3 border-t pt-2">
                          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500" title="Maintenance, Jude's house, shop, errands. Drive time between jobs is production.">Non-prod hours</div>
                          <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                            {activePeople.map((p) => (
                              <div key={p.id} className="flex items-center gap-2"><span className="w-28 shrink-0 truncate text-sm">{p.name}</span><div className="w-36"><TimeCell value={e.np?.[p.id] || ''} onChange={setDayNp(d, p.id)} /></div></div>
                            ))}
                          </div>
                        </div>
                      )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* week totals */}
                  <div className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200 text-sm sm:grid-cols-4">
                    {[['Week revenue', fmt(wkRev)], ['Week COGS', fmt(wkCogs)], ['Prod hrs', `${hmm(wkProd)}${wkNp ? ` of ${hmm(wkMin)}` : ''}`]].map(([k, v]) => <div key={k} className="bg-slate-50 px-4 py-2.5"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{k}</div><div className="font-bold tabular-nums">{v}</div></div>)}
                    <div className={`px-4 py-2.5 ${wkTone.box}`}><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Week rev / hr</div><div className={`font-black tabular-nums ${wkTone.text}`}>{wkRph == null ? '—' : fmt(wkRph)} <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${wkTone.pill}`}>{wkTone.label}</span></div></div>
                  </div>
                </div>
              );
            })()}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px]">
                <thead><tr className="border-b bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left">Person</th><th className={`${th} w-20`}>Rate</th><th className={`${th} w-40`}>Total hrs</th><th className={`${th} w-20`}>Reg</th><th className={`${th} w-20`}>OT</th><th className={`${th} w-40`}>Non-prod</th><th className={`${th} w-20`} title="Christmas lights hours, from each day's details. Paid at the normal rate, not lawn production.">Lights</th><th className={`${th} w-20`}>On jobs</th><th className={`${th} w-20`}>Prod</th><th className={`${th} w-24`}>Wages</th><th className={`${th} w-20`}>Bonus</th><th className={`${th} w-24`}>Pay</th><th className="w-8" />
                </tr></thead>
                <tbody>
                  {activePeople.length === 0 && <tr><td colSpan={13} className="px-3 py-6 text-center text-sm text-slate-400">No team members yet — add them on the <Link to="/team" className="underline">Team page</Link>.</td></tr>}
                  {activePeople.map((p) => { const c = calc?.people.find((x) => x.id === p.id); return (
                    <tr key={p.id} className="border-b">
                      <td className="px-3 py-1.5 text-sm font-semibold">{p.name}{p.isTrial && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">trial</span>}</td>
                      <td className="px-2 py-1.5"><div className="relative"><span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span><input key={p.hourly_rate} className={`${cell} pl-5`} inputMode="decimal" defaultValue={p.hourly_rate || ''} placeholder="rate" onBlur={(e) => num(e.target.value) !== Number(p.hourly_rate) && setRate(p, num(e.target.value))} /></div></td>
                      <td className="px-2 py-1.5"><TimeCell value={draft.hours[p.id]?.total || ''} onChange={setHours(p.id, 'total')} /></td>
                      <td className={`${th} text-sm tabular-nums text-slate-500`}>{hmm(regOf(c?.total_minutes))}</td>
                      <td className={`${th} text-sm tabular-nums ${otOf(c?.total_minutes) ? 'font-semibold text-amber-700' : 'text-slate-300'}`}>{hmm(otOf(c?.total_minutes))}</td>
                      <td className="px-2 py-1.5">{(() => { const dm = Object.values(draft.days).reduce((a, e) => a + (parseTime(e.np?.[p.id] || '') || 0), 0); const any = Object.values(draft.days).some((e) => e.np?.[p.id]);
                        return any ? <div className={`${cell} bg-slate-50 text-slate-600`} title="Sum of this person's non-prod on each day">{minutesToHMM(dm)}</div> : <TimeCell value={draft.hours[p.id]?.np || ''} onChange={setHours(p.id, 'np')} />; })()}</td>
                      <td className={`${th} text-sm tabular-nums ${c?.lights_minutes ? 'font-semibold text-[#B3121F]' : 'text-slate-300'}`}>{hmm(c?.lights_minutes)}</td>
                      <td className={`${th} text-sm tabular-nums text-slate-500`}>{hmm(c?.job_minutes)}</td>
                      <td className={`${th} text-sm font-semibold tabular-nums text-[#4d7c0f]`}>{hmm(c?.prod_minutes)}</td>
                      <td className={`${th} text-sm tabular-nums`}>{fmt(c?.wages)}</td>
                      <td className={`${th} text-sm tabular-nums ${c?.bonus > 0 ? 'text-[#4d7c0f]' : 'text-slate-400'}`} title={c ? `Week bonus ${fmt(c.week_bonus)} + job bonus ${fmt(c.job_bonus)} + extra ${fmt(c.extra_bonus)}${c.lights_bonus || c.lead_bonus ? ` + lights ${fmt(c.lights_bonus)} + lights lead ${fmt(c.lead_bonus)}` : ''}` : undefined}>{fmt(c?.bonus)}</td>
                      <td className={`${th} text-sm font-bold tabular-nums`} title={c?.total_minutes > 0 ? `${fmt(c.total_pay / (c.total_minutes / 60))} earned per hour` : undefined}>{fmt(c?.total_pay)}</td>
                      <td className="px-1" />
                    </tr>
                  ); })}
                </tbody>
                {t && activePeople.length > 0 && <tfoot><tr className="bg-slate-50 text-sm font-bold tabular-nums"><td className="px-3 py-2" colSpan={2}>Crew</td><td className={th}>{hmm(t.total_minutes)}</td><td className={th}>{hmm(calc.people.reduce((a, x) => a + regOf(x.total_minutes), 0))}</td><td className={`${th} text-amber-700`}>{hmm(calc.people.reduce((a, x) => a + otOf(x.total_minutes), 0))}</td><td className={th}>{hmm(t.np_minutes)}</td><td className={`${th} text-[#B3121F]`}>{hmm(t.lights_minutes)}</td><td className={th}>{hmm(t.job_minutes)}</td><td className={`${th} text-[#4d7c0f]`}>{hmm(t.prod_minutes)}</td><td className={th}>{fmt(t.wages)}</td><td className={`${th} text-[#4d7c0f]`}>{fmt(t.bonus)}</td><td className={th}>{fmt(t.total_pay)}</td><td /></tr></tfoot>}
              </table>
            </div>
          </div>
          {/* bonus + pay for the people above */}
          {calc && (<div className="border-t">
            <div className="border-b bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Bonus &amp; pay</div>
            {/* The bonus as a stacked math problem: revenue − COGS = margin, × target % = allowed labor, − production wages = pool. */}
            {(() => {
              const allowed = calc.week.margin * targetPct / 100;
              const left = allowed - calc.week.prodWages;
              const line = mathLine;
              const pool = calc.week.pool;
              const step = (n, label, value, sub, tone) => (
                <div className={`rounded-lg border p-3 ${tone === 'good' ? 'border-emerald-200 bg-emerald-50' : tone === 'bad' ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500"><span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-[10px] text-white">{n}</span>{label}</div>
                  <div className={`mt-1 text-2xl font-black tabular-nums ${tone === 'good' ? 'text-emerald-700' : ''}`}>{value}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
                </div>
              );
              return (
                <div className="border-b px-4 py-4 text-sm">
                  <div className="mb-2 font-bold">Lawn bonus this week</div>
                  <div className="grid gap-2 md:grid-cols-3">
                    {step(1, 'Lawn work made', fmt(calc.week.margin), `after materials and card fees${calc.lights.revenue ? ` · ${fmt0(calc.lights.revenue)} of lights not counted` : ''}`)}
                    {step(2, `${targetPct}% can go to the crew`, fmt(allowed), `their lawn hours cost ${fmt(calc.week.prodWages)}`)}
                    {step(3, 'Left over = bonus', fmt(pool), calc.week.laborPct == null ? 'no lawn work yet' : pool > 0 ? 'split by production hours' : `crew cost ${fmt(-left)} more than ${targetPct}%, so no bonus`, pool > 0 ? 'good' : 'bad')}
                  </div>
                  {calc.doneJobs.length > 0 && <div className="mt-2 text-xs text-slate-600">Plus finished job bonus: <b>{fmt(t.job_bonus)}</b> ({calc.doneJobs.map((j) => j.name).join(', ')})</div>}
                  <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-800">Show the full math</summary>
                  <div className="mt-2 max-w-md">
                    {line('', 'Lawn revenue (finished work)', fmt(calc.week.revenue), { sub: calc.lights.revenue ? `${fmt(calc.lights.revenue)} lights not counted` : undefined })}
                    {line('−', 'COGS', fmt(calc.week.cogs - (calc.lawnFees || 0)))}
                    {calc.lawnFees > 0 && line('−', 'Processing fees', fmt(calc.lawnFees), { sub: `${calc.feePct}% of revenue` })}
                    {line('=', 'Margin', fmt(calc.week.margin), { bold: true, rule: true })}
                    {line('×', `Labor target`, `${targetPct}%`)}
                    {line('=', 'Allowed for labor', fmt(allowed), { bold: true, rule: true })}
                    {line('−', 'Production wages', fmt(calc.week.prodWages), { sub: `labor ${pctFmt(calc.week.laborPct)}` })}
                    {/* where production wages come from: each person's production hours at their normal rate */}
                    <div className="mb-1 ml-8 border-l-2 border-slate-200 pl-3 text-xs text-slate-500">
                      {calc.people.filter((p) => p.prod_minutes > 0).map((p) => (
                        <div key={p.id} className="flex justify-between gap-3 py-0.5"><span>{p.name} · {hmm(p.prod_minutes)} prod × {fmt(p.rate)}</span><span className="tabular-nums">{fmt(p.prod_wages)}</span></div>
                      ))}
                      {calc.people.some((p) => p.ot_premium > 0) && (
                        <div className="flex justify-between gap-3 py-0.5 text-amber-800" title="Overtime hours count at the normal rate above; the extra half is paid to them but not counted against the bonus.">
                          <span>OT extra half ({calc.people.filter((p) => p.ot_premium > 0).map((p) => `${p.name} ${fmt(p.ot_premium)}`).join(', ')}) — paid, not counted</span><span className="tabular-nums">{fmt(0)}</span>
                        </div>
                      )}
                      {calc.people.some((p) => p.np_minutes > 0) && (
                        <div className="flex justify-between gap-3 py-0.5"><span>Non-prod hours — paid, not counted</span><span className="tabular-nums">{fmt(0)}</span></div>
                      )}
                      {calc.people.some((p) => p.lights_minutes > 0) && (
                        <div className="flex justify-between gap-3 py-0.5 text-[#B3121F]"><span>Christmas lights hours — paid, not counted (lights have their own bonus)</span><span className="tabular-nums">{fmt(0)}</span></div>
                      )}
                    </div>
                    {line('=', 'Weekly bonus pool', fmt(calc.week.pool), { bold: true, rule: true, tone: calc.week.pool > 0 ? 'good' : undefined,
                      sub: calc.week.laborPct == null ? 'no margin yet' : left < 0 ? `${fmt(-left)} over — no bonus` : 'under target' })}
                    {calc.doneJobs.length > 0 && line('+', `Finished job bonus (${calc.doneJobs.map((j) => j.name).join(', ')})`, fmt(t.job_bonus), { bold: true, tone: t.job_bonus > 0 ? 'good' : undefined })}
                  </div>
                  </details>
                </div>
              );
            })()}
            {/* Christmas lights: their own pay plan, figured per day */}
            {calc.lights.days.length > 0 && (
              <div className="border-b px-4 py-3 text-sm">
                <div className="mb-1 font-bold">🎄 Lights bonus this week: <span className="tabular-nums text-[#4d7c0f]">{fmt(t.lights_bonus + t.lead_bonus)}</span></div>
                <div className="text-sm text-slate-600">
                  {t.lights_bonus > 0 ? <>Crew bonus <b>{fmt(t.lights_bonus)}</b> from {calc.lights.days.filter((x) => x.pool > 0).map((x) => fmtDay(x.date)).join(', ')}</> : <>No crew bonus: no day reached $2,000 installed</>}
                  {t.lead_bonus > 0 && <> · Ethan's {LIGHTS_LEAD_PCT * 100}% lead bonus <b>{fmt(t.lead_bonus)}</b></>}.
                  {' '}Lights hours are paid at their normal rate.
                </div>
                {calc.lights.days.some((x) => x.warnings.length) && <div className="mt-1 text-xs font-semibold text-amber-800">{[...new Set(calc.lights.days.flatMap((x) => x.warnings.map((w) => `${fmtDay(x.date)}: ${w}`)))].join(' ')}</div>}
                <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-800">Show each day</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead><tr className="border-b text-[11px] font-bold uppercase tracking-wide text-slate-500"><th className="px-2 py-1.5 text-left">Day</th><th className="px-2 text-right">Install value</th><th className="px-2 text-right">Tier</th><th className="px-2 text-right">Crew pool</th><th className="px-2 text-left">Split by lights hrs</th><th className="px-2 text-right">Ethan +1%</th></tr></thead>
                    <tbody>{calc.lights.days.map((L) => (
                      <tr key={L.date} className="border-b align-top">
                        <td className="whitespace-nowrap px-2 py-1.5 font-semibold">{fmtDay(L.date)}{L.warnings.map((w) => <div key={w} className="whitespace-normal text-[11px] font-normal text-amber-800">{w}</div>)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmt(L.install)}{L.revenue > L.install && <div className="text-[11px] text-slate-400">+{fmt(L.revenue - L.install)} hourly-only</div>}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{(L.pct * 100).toFixed(0)}%</td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmt(L.pool)}</td>
                        <td className="px-2 py-1.5 text-xs text-slate-600">{Object.keys(L.byPerson).length ? Object.entries(L.byPerson).map(([pid, m]) => <div key={pid}>{calc.people.find((x) => x.id === pid)?.name || pid} · {hmm(m)} → {fmt(L.shares[pid] || 0)}</div>) : '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmt(L.lead)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <div className="mt-2 text-xs text-slate-500">Tiers on the whole day's install value: under {fmt0(LIGHTS_TIERS[LIGHTS_TIERS.length - 1][0])} 0% · {[...LIGHTS_TIERS].reverse().map(([min, pct]) => `${fmt0(min)}+ ${pct * 100}%`).join(' · ')}. Each day resets. Lights hours this week: {hmm(calc.lights.minutes)}, paid at each person's normal rate ({fmt(t.lights_pay)}).</div>
                </details>
              </div>
            )}
            {/* extra bonuses: reviews and anything else, added by hand */}
            <div className="border-b px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <div><span className="text-sm font-bold">Extra bonuses</span> <span className="text-xs text-slate-500">reviews, shout-outs, anything else — added to pay, not counted as labor</span></div>
                {t.extra_bonus > 0 && <span className="text-sm font-bold tabular-nums text-[#4d7c0f]">{fmt(t.extra_bonus)}</span>}
              </div>
              <div className="space-y-1.5">
                {(draft.reviews || []).map((r, i) => {
                  const set = (patch) => setReviews((rs) => rs.map((y, k) => (k === i ? { ...y, ...patch } : y)));
                  return (
                    <div key={r.id} className="grid grid-cols-[7.5rem_minmax(0,1fr)_11rem_11rem_2rem] items-center gap-2 rounded-lg bg-amber-50/60 p-1.5">
                      <span className="text-sm font-semibold text-amber-800">★ 5-star review</span>
                      <input className={cell.replace('text-right', 'text-left')} placeholder="Client" value={r.client} onChange={(e) => set({ client: e.target.value })} />
                      <select className={cell.replace('text-right', 'text-left')} value={r.leader} onChange={(e) => set({ leader: e.target.value, ...(r.helper === e.target.value ? { helper: '' } : {}) })} title={`Leader gets ${fmt(REVIEW_PAY.leader)}`}>
                        <option value="">Leader ({fmt(REVIEW_PAY.leader)})…</option>
                        {activePeople.map((p) => <option key={p.id} value={p.id}>{p.name} · leader {fmt(REVIEW_PAY.leader)}</option>)}
                      </select>
                      <select className={cell.replace('text-right', 'text-left')} value={r.helper} onChange={(e) => set({ helper: e.target.value })} title={`Helper gets ${fmt(REVIEW_PAY.helper)}`}>
                        <option value="">No helper</option>
                        {activePeople.filter((p) => p.id !== r.leader).map((p) => <option key={p.id} value={p.id}>{p.name} · helper {fmt(REVIEW_PAY.helper)}</option>)}
                      </select>
                      <button onClick={() => setReviews((rs) => rs.filter((_, k) => k !== i))} className="rounded p-1 text-slate-400 hover:text-red-600" aria-label="Remove review"><Trash2 size={14} /></button>
                    </div>
                  );
                })}
                {(draft.extras || []).map((x, i) => (
                  <div key={i} className="grid grid-cols-[11rem_minmax(0,1fr)_7rem_2rem] items-center gap-2">
                    <select className={cell.replace('text-right', 'text-left')} value={x.pid} onChange={(e) => setExtras((xs) => xs.map((y, k) => (k === i ? { ...y, pid: e.target.value } : y)))}>
                      {activePeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input className={cell.replace('text-right', 'text-left')} placeholder="Reason (e.g. 5-star review — Jane Doe)" value={x.reason} onChange={(e) => setExtras((xs) => xs.map((y, k) => (k === i ? { ...y, reason: e.target.value } : y)))} />
                    <div className="relative"><span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span><input className={`${cell} pl-5`} inputMode="decimal" placeholder="0.00" value={x.amount} onChange={(e) => setExtras((xs) => xs.map((y, k) => (k === i ? { ...y, amount: e.target.value } : y)))} /></div>
                    <button onClick={() => setExtras((xs) => xs.filter((_, k) => k !== i))} className="rounded p-1 text-slate-400 hover:text-red-600" aria-label="Remove bonus"><Trash2 size={14} /></button>
                  </div>
                ))}
                {activePeople.length > 0 && <div className="flex gap-4">
                  <button onClick={() => setReviews((rs) => [...rs, { id: `r${Date.now()}`, client: '', leader: '', helper: '' }])} className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 hover:underline"><Plus size={13} /> 5-star review</button>
                  <button onClick={() => setExtras((xs) => [...xs, { pid: activePeople[0].id, reason: '', amount: '' }])} className="inline-flex items-center gap-1 text-xs font-semibold text-[#4d7c0f] hover:underline"><Plus size={13} /> Other bonus</button>
                </div>}
              </div>
            </div>
            {/* what to pay each person: hours, OT, and every bonus with what it's for */}
            {(() => {
              const working = calc.people.filter((p) => p.total_minutes > 0 || p.total_pay > 0);
              const paid = working.filter((p) => !PAID_BY_DRAW.has(p.id));
              const draws = working.filter((p) => PAID_BY_DRAW.has(p.id));
              if (!working.length) return null;
              const item = (label, value, cls = '') => (
                <div className={`flex items-baseline justify-between gap-3 py-0.5 ${cls}`}><span className="text-slate-600">{label}</span><span className="tabular-nums">{value}</span></div>
              );
              return (
                <div className="px-4 py-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-bold">Pay by person <span className="text-xs font-normal text-slate-500">what to put in payroll for each employee</span></div>
                    <a href={ADP_PAYROLL_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-[#4d7c0f] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#3f6212]"><ExternalLink size={14} /> Open ADP payroll</a>
                  </div>
                  {draws.map((p) => (
                    <div key={p.id} className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <span><b>{p.name}: not in ADP — paid by owner's draw.</b> Check your draw separately. {hmm(p.total_minutes)} at {fmt(p.rate)} = {fmt(p.total_pay)} counts as labor for the bonus, but isn't in the ADP totals.</span>
                    </div>
                  ))}
                  {/* one row, side by side, however many people there are */}
                  <div className="grid gap-3 md:auto-cols-fr md:grid-flow-col">
                    {paid.map((p) => {
                      const ot = otOf(p.total_minutes);
                      return (
                        <div key={p.id} className="rounded-lg border p-3 text-sm">
                          <div className="mb-1.5 flex items-baseline justify-between"><span className="font-bold">{p.name}</span><span className="font-black tabular-nums">{fmt(p.total_pay)}</span></div>
                          {item(`Regular ${p.reg_hours.toFixed(2)} h × ${fmt(p.rate)}`, fmt(p.reg_pay))}
                          {ot > 0 && item(`Overtime ${p.ot_hours.toFixed(2)} h × ${fmt(p.rate * 1.5)}`, fmt(p.ot_pay), 'text-amber-800')}
                          {p.lights_hours > 0 && <div className="pl-3 text-[11px] text-slate-500">incl. {p.lights_hours.toFixed(2)} h Christmas lights</div>}
                          {p.bonus_ot > 0 && item('OT on lights bonus', fmt(p.bonus_ot), 'text-amber-800')}
                          {p.week_bonus > 0 && item('Weekly bonus (share of pool)', fmt(p.week_bonus), 'text-[#4d7c0f]')}
                          {p.lights_bonus > 0 && item('Christmas lights crew bonus', fmt(p.lights_bonus), 'text-[#4d7c0f]')}
                          {p.lead_bonus > 0 && item('Christmas lights lead bonus (1%)', fmt(p.lead_bonus), 'text-[#4d7c0f]')}
                          {p.job_bonus > 0 && item('Finished job bonus', fmt(p.job_bonus), 'text-[#4d7c0f]')}
                          {p.extras.map((x, i) => <div key={i}>{item(x.reason || 'Extra bonus', fmt(x.amount), 'text-[#4d7c0f]')}</div>)}
                          {p.bonus === 0 && item('Bonuses', fmt(0), 'text-slate-400')}
                          <div className="mt-1 flex items-baseline justify-between border-t-2 border-slate-800 pt-1 font-bold"><span>Total pay</span><span className="tabular-nums">{fmt(p.total_pay)}</span></div>
                          {/* the three numbers payroll asks for, one click each */}
                          <div className="mt-2 grid grid-cols-3 gap-1.5">
                            <CopyChip label="Regular hrs" value={p.reg_hours.toFixed(2)} />
                            <CopyChip label="OT hrs" value={p.ot_hours.toFixed(2)} />
                            <CopyChip label="Bonuses" value={(p.bonus + (p.bonus_ot || 0)).toFixed(2)} prefix="$" />
                          </div>
                          {p.bonus_ot > 0 && <div className="mt-1.5 text-[11px] text-slate-500">Bonuses include {fmt(p.bonus_ot)} OT on the lights bonus (a promised bonus raises the overtime rate).</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>)}
          <div className="grid gap-3 border-t p-4 sm:grid-cols-[12rem_1fr]">
            <Field label="Employer taxes" prefix="$" hint={t?.wages > 0 && num(draft.taxes) > 0 ? `${pctOf(num(draft.taxes), t.wages)} of wages` : 'FICA match, FUTA, SUTA'}><input className={input} inputMode="decimal" placeholder="0.00" value={draft.taxes} onChange={setField('taxes')} /></Field>
            <Field label="Notes (optional)"><input className={input} placeholder="Anything worth remembering about this week" value={draft.notes} onChange={setField('notes')} /></Field>
          </div>
          {/* What ADP's preview should show: gross for everyone paid through ADP (not owner's draw) + employer taxes = cash required. */}
          {calc && (() => {
            const adp = calc.people.filter((p) => !PAID_BY_DRAW.has(p.id) && p.total_pay > 0);
            if (!adp.length) return null;
            const gross = adp.reduce((s, p) => s + p.total_pay, 0), taxes = num(draft.taxes);
            return (
              <div className="mx-4 mb-4 rounded-lg border-2 border-slate-800 px-4 py-3 text-sm">
                <div className="mb-1.5 font-bold">Check against ADP <span className="text-xs font-normal text-slate-500">these should match ADP's payroll preview</span></div>
                <div className="max-w-md">
                  {adp.map((p) => <div key={p.id} className="flex justify-between gap-3 py-0.5 text-slate-600"><span>{p.name} gross</span><span className="tabular-nums">{fmt(p.total_pay)}</span></div>)}
                  <div className="flex justify-between gap-3 border-t py-0.5 font-semibold"><span>Total gross pay</span><span className="tabular-nums">{fmt(gross)}</span></div>
                  <div className={`flex justify-between gap-3 py-0.5 ${taxes ? '' : 'text-amber-700'}`}><span>+ Employer taxes {!taxes && '(enter from ADP above)'}</span><span className="tabular-nums">{fmt(taxes)}</span></div>
                  <div className="mt-1 flex justify-between gap-3 border-t-2 border-slate-800 pt-1 text-base font-black"><span>= Cash required</span><span className="tabular-nums">{fmt(gross + taxes)}</span></div>
                  <p className="mt-1 text-xs text-slate-500">If ADP's cash required is a little higher, the difference is usually ADP's own service fees.</p>
                </div>
              </div>
            );
          })()}
          {/* summary — the efficiency numbers, nothing else */}
          {calc && (() => {
            const ph = t.prod_minutes / 60;
            const gp = calc.week.margin; // finished work: revenue − COGS
            return (
              <div className="border-t">
                <header className="border-b bg-slate-50 px-4 py-3"><h3 className="font-bold">Week summary</h3></header>
                {/* The simple version: a verdict, then money in → costs → what you kept. */}
                {(() => {
                  const made = t.revenue - t.cogs - t.wages - t.bonus - t.employer_taxes;
                  const pct = t.revenue > 0 ? made / t.revenue : null;
                  const others = history.filter((h) => h.week_ending !== week && h.revenue > 0);
                  const avg = others.length ? others.reduce((a, h) => a + madeOf(h), 0) / others.length : null;
                  const vsAvg = avg == null ? null : made - avg;
                  const grade = t.revenue > 0 ? gradeOf(t.lawn_revenue - t.lawn_cogs > 0 ? (t.lawn_prod_wages + t.week_bonus + t.job_bonus) / (t.lawn_revenue - t.lawn_cogs) : null, (t.total_minutes - t.np_minutes) > 0 ? t.revenue / ((t.total_minutes - t.np_minutes) / 60) : null) : null;
                  const verdict = grade?.level || null;
                  // Wages split: non-prod = each person's non-prod hours at their rate; production = everything else
                  // (lawn + lights hours, drive time between jobs, and any overtime extra), so the two add up to wages.
                  const npWages = Math.round(calc.people.reduce((a, p) => a + (p.np_minutes / 60) * p.rate, 0) * 100) / 100;
                  const prodWagesAll = t.wages - npWages;
                  const otExtra = calc.people.reduce((a, p) => a + (p.ot_premium || 0) + (p.bonus_ot || 0), 0);
                  const share = (n) => (t.revenue > 0 ? `${((n / t.revenue) * 100).toFixed(0)}%` : null);
                  const box = (op, label, value, sub, cls = '', pctOfIn = null) => (
                    <div className="flex items-stretch gap-2">
                      {op && <div className="flex items-center text-xl font-black text-slate-300">{op}</div>}
                      <div className="flex-1 rounded-lg border border-slate-200 bg-white p-3">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
                        <div className={`mt-1 text-2xl font-black tabular-nums ${cls}`}>{value}{pctOfIn && <span className="ml-2 text-base font-bold text-slate-400">{pctOfIn}</span>}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
                      </div>
                    </div>
                  );
                  return (
                    <div className="space-y-3 px-4 py-4 text-sm">
                      {verdict && (
                        <div className={`rounded-lg px-3 py-2 ${verdict === 'good' ? 'bg-[#B0FF03]/20' : verdict === 'bad' ? 'bg-red-50' : 'bg-amber-50'}`}>
                          <span className={`font-black ${verdict === 'good' ? 'text-[#3f6212]' : verdict === 'bad' ? 'text-red-700' : 'text-amber-800'}`}>{verdict === 'good' ? 'Good week' : verdict === 'bad' ? 'Rough week' : 'Okay week'}</span>
                          <span className="text-slate-700">{grade.checks.map((c) => <span key={c.text}> · {c.ok ? '✓' : '✗'} {c.text}</span>)}{t.lights_install > 0 && (() => { const lp = t.lights_install_labor / t.lights_install; return <span> · {lp <= LIGHTS_INSTALL_TARGET ? '✓' : '✗'} lights {(lp * 100).toFixed(0)}% (goal {Math.round(LIGHTS_INSTALL_TARGET * 100)}%)</span>; })()}{vsAvg != null ? <span className="text-slate-500"> · kept {fmt0(Math.abs(vsAvg))} {vsAvg >= 0 ? 'more' : 'less'} than your average week</span> : ''}</span>
                        </div>
                      )}
                      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">
                        {box('', 'Money in', fmt(t.revenue), 'finished work, lawn + lights')}
                        {box('−', 'Materials & fees', fmt(t.cogs), 'COGS + card fees', '', share(t.cogs))}
                        {box('−', 'Production wages', fmt(prodWagesAll), `${minutesToHMM(t.total_minutes - t.np_minutes)} hrs: lawn${t.lights_minutes ? ' + lights' : ''} + drive time${otExtra > 0 ? ` · incl. ${fmt0(otExtra)} OT extra` : ''}`, '', share(prodWagesAll))}
                        {box('−', 'Non-prod wages', fmt(npWages), t.np_minutes ? `${minutesToHMM(t.np_minutes)} hrs: shop, errands, your house` : 'no non-prod hours', npWages ? 'text-amber-700' : '', share(npWages))}
                        {box('−', 'Bonuses', fmt(t.bonus), [t.week_bonus && `lawn ${fmt0(t.week_bonus)}`, (t.lights_bonus + t.lead_bonus) > 0 && `lights ${fmt0(t.lights_bonus + t.lead_bonus)}`, t.job_bonus && `jobs ${fmt0(t.job_bonus)}`, t.extra_bonus && `extras ${fmt0(t.extra_bonus)}`].filter(Boolean).join(' · ') || 'none this week', '', share(t.bonus))}
                        {box('−', 'Employer taxes', t.employer_taxes ? fmt(t.employer_taxes) : '—', t.employer_taxes ? 'from ADP' : 'not entered yet: add it after ADP runs', t.employer_taxes ? '' : 'text-slate-300', t.employer_taxes ? share(t.employer_taxes) : null)}
                        {box('=', 'You kept', fmt(made), 'of money in · before overhead', made >= 0 ? 'text-emerald-700' : 'text-red-600', pct == null ? null : `${(pct * 100).toFixed(0)}%`)}
                      </div>
                      {(() => {
                        // Fully loaded labor: every dollar the crew costs (all wages incl. non-prod and OT, bonuses, employer taxes).
                        const loaded = t.wages + t.bonus + t.employer_taxes, gp = t.revenue - t.cogs;
                        // What you control: production wages (non-prod left out) + commission bonuses (lawn weekly + finished jobs + lights).
                        const comm = t.wages - t.np_wages + t.week_bonus + t.job_bonus + t.lights_bonus + t.lead_bonus;
                        const ofIn = t.revenue > 0 ? loaded / t.revenue : null, ofGp = gp > 0 ? loaded / gp : null;
                        return (
                          <>
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border-2 border-[#0F2236] bg-white px-3 py-2">
                            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-700">Labor + commission</span>
                            <span className="text-2xl font-black tabular-nums">{gp > 0 ? `${((comm / gp) * 100).toFixed(1)}%` : '—'}</span>
                            <span className="tabular-nums text-slate-600">of adjusted revenue · {fmt(comm)} ÷ {fmt(gp)}</span>
                            <span className="text-xs text-slate-500">production wages + weekly lawn bonus + lights bonus · non-prod, reviews/extras and taxes left out · goal 30%</span>
                          </div>
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Fully loaded labor</span>
                            <span className="text-lg font-black tabular-nums">{fmt(loaded)}</span>
                            <span className="tabular-nums"><b>{ofIn == null ? '—' : `${(ofIn * 100).toFixed(1)}%`}</b> of money in</span>
                            <span className="tabular-nums text-slate-500">· <b className="text-slate-700">{ofGp == null ? '—' : `${(ofGp * 100).toFixed(1)}%`}</b> of gross profit</span>
                            <span className="text-xs text-slate-500">all wages + bonuses + employer taxes{t.employer_taxes ? '' : ' (taxes not entered yet, so this will go up)'}</span>
                          </div>
                          </>
                        );
                      })()}
                    </div>
                  );
                })()}
                <details className="border-t">
                <summary className="cursor-pointer px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800">Show the details</summary>
                {(() => {
                  // What the week made, every cost taken out, then: is it good? Judged by the labor
                  // target and against your own recent weeks (the range picked under Past weeks).
                  const made = t.revenue - t.cogs - t.wages - t.bonus - t.employer_taxes;
                  const pct = t.revenue > 0 ? made / t.revenue : null;
                  const others = history.filter((h) => h.week_ending !== week && h.revenue > 0);
                  const avg = others.length ? others.reduce((a, h) => a + madeOf(h), 0) / others.length : null;
                  const vsAvg = avg == null ? null : made - avg;
                  const laborOk = calc.week.laborPct != null && calc.week.under;
                  const verdict = t.revenue <= 0 ? null : laborOk && (vsAvg == null || vsAvg >= 0) ? 'good' : !laborOk && vsAvg != null && vsAvg < 0 ? 'bad' : 'ok';
                  return (
                    <div className="grid gap-4 border-b px-4 py-3 text-sm md:grid-cols-[minmax(0,28rem)_1fr]">
                      <div>
                        {mathLine('', 'Revenue (finished work)', fmt(t.revenue))}
                        {mathLine('−', 'COGS', fmt(t.cogs))}
                        {mathLine('=', 'Gross profit', fmt(t.revenue - t.cogs), { bold: true, rule: true })}
                        {mathLine('−', 'Wages', fmt(t.wages), { sub: `all ${minutesToHMM(t.total_minutes)} hrs, OT included` })}
                        {mathLine('−', 'Bonuses', fmt(t.bonus), { sub: 'weekly, jobs, reviews' })}
                        {mathLine('−', 'Employer taxes', fmt(t.employer_taxes))}
                        {/* payroll in one number, and without anyone paid by owner's draw — that's what ADP shows */}
                        {(() => {
                          const all = t.wages + t.bonus + t.employer_taxes;
                          const drawn = calc.people.filter((p) => PAID_BY_DRAW.has(p.id) && p.total_pay > 0);
                          const drawPay = drawn.reduce((a, p) => a + p.total_pay, 0);
                          return (
                            <div className="mb-1 ml-8 border-l-2 border-slate-200 pl-3 text-xs text-slate-500">
                              <div className="flex justify-between gap-3 py-0.5"><span>Payroll total (wages + bonuses + employer taxes)</span><span className="font-semibold tabular-nums text-slate-700">{fmt(all)}</span></div>
                              {drawn.length > 0 && (
                                <div className="flex justify-between gap-3 py-0.5 text-amber-800"><span>Without {drawn.map((p) => p.name).join(', ')} (owner's draw, {fmt(drawPay)}) — should match ADP</span><span className="font-semibold tabular-nums">{fmt(all - drawPay)}</span></div>
                              )}
                            </div>
                          );
                        })()}
                        {mathLine('=', 'We made', fmt(made), { bold: true, rule: true, tone: made >= 0 ? 'good' : 'bad', sub: pct == null ? 'before overhead' : `${(pct * 100).toFixed(1)}% of revenue · before overhead` })}
                      </div>
                      <div className="space-y-3">
                        {verdict && (
                          <div className={`self-start rounded-lg p-3 ${verdict === 'good' ? 'bg-[#B0FF03]/20' : verdict === 'bad' ? 'bg-red-50' : 'bg-amber-50'}`}>
                            <div className={`mb-1.5 text-base font-black ${verdict === 'good' ? 'text-[#3f6212]' : verdict === 'bad' ? 'text-red-700' : 'text-amber-800'}`}>{verdict === 'good' ? 'Good week' : verdict === 'bad' ? 'Rough week' : 'Okay week'}</div>
                            <div className="space-y-1 text-slate-700">
                              <div>{laborOk ? '✓' : '✗'} Labor {pctFmt(calc.week.laborPct)} — {laborOk ? `under your ${targetPct}% target` : `over your ${targetPct}% target`}</div>
                              {vsAvg != null && <div>{vsAvg >= 0 ? '✓' : '✗'} {fmt(Math.abs(vsAvg))} {vsAvg >= 0 ? 'more' : 'less'} than your average week ({fmt(avg)}, last {others.length} wk{others.length === 1 ? '' : 's'})</div>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
                <div className="grid grid-cols-2 gap-px bg-slate-100 md:grid-cols-3 xl:grid-cols-6">
                  <Tile label="Gross profit" value={fmt(gp)} sub={`${fmt(calc.week.revenue)} − ${fmt(calc.week.cogs)} COGS`} />
                  <Tile label="Production labor" value={fmt(calc.week.prodWages)} sub={`${minutesToHMM(t.prod_minutes)} production hrs`} />
                  <Tile label="Gross profit / prod hr" value={ph > 0 ? fmt(gp / ph) : '—'} sub={`${ph > 0 ? fmt(calc.week.revenue / ph) : '—'} revenue / prod hr`} big />
                  <Tile label="Labor efficiency" value={pctFmt(calc.week.laborPct)} sub={`production labor ÷ gross profit · target ${targetPct}%`} tone={calc.week.laborPct == null ? undefined : calc.week.under ? 'good' : 'bad'} />
                  <Tile label="Profit after labor" value={fmt(t.revenue - t.cogs - t.total_pay - t.employer_taxes)} sub={`GP − all wages ${fmt(t.wages)} − bonus ${fmt(t.bonus)} − emp. taxes ${fmt(t.employer_taxes)} · before overhead`} tone={t.revenue - t.cogs - t.total_pay - t.employer_taxes < 0 ? 'bad' : 'good'} big />
                  <Tile label="Bonus pool" value={fmt(t.bonus)} sub={t.job_bonus ? `incl. ${fmt(t.job_bonus)} job bonus` : `${minutesToHMM(t.np_minutes)} non-prod · ${minutesToHMM(t.total_minutes)} total hrs`} tone={t.bonus > 0 ? 'good' : undefined} />
                </div>
                </details>
              </div>
            );
          })()}
          {/* save, then close — the last step once the summary looks right */}
          <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
            <button onClick={save} disabled={busy || !live.ok} className="flex items-center gap-2 rounded-lg bg-[#4d7c0f] px-4 py-2 text-sm font-bold text-white hover:bg-[#3f6a0a] disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {busy ? 'Saving…' : 'Save now'}</button>
            <span className="text-xs text-slate-400">autosaves as you type</span>
            {current && <button onClick={remove} className="flex items-center gap-1 text-sm text-slate-400 hover:text-red-600"><Trash2 size={14} /> Delete week</button>}
            {!live.ok && <span className="text-sm text-red-600">{live.error}</span>}
            {msg && <span className={`text-sm ${msg.ok ? 'text-[#4d7c0f]' : 'text-red-600'}`}>{msg.text}</span>}
            {week < thisWeek && !closed && <button onClick={() => (dirty.current ? save() : Promise.resolve()).then(() => setClosed(true))} disabled={busy || !!pulling || !live?.ok} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#4d7c0f] px-4 py-2 text-sm font-bold text-white hover:bg-[#3f6212] disabled:opacity-50"><Check size={14} /> Close week</button>}
          </div>
        </section>

        </fieldset>

        {/* history — same numbers as the summary, one line per week */}
        <section className="rounded-xl border bg-white">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h3 className="font-bold">Past weeks</h3>
            <div className="flex gap-1 text-xs">{RANGES.map(([id, label]) => <button key={id} onClick={() => setRange(id)} className={`rounded-full px-2.5 py-1 font-semibold ${range === id ? 'bg-[#4d7c0f] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>)}</div>
          </header>
          {lightsSeason && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-red-50/60 px-4 py-2 text-xs text-slate-700">
              <span className="font-bold text-[#B3121F]">🎄 Lights season</span>
              <span>Installed <b className="tabular-nums">{fmt0(lightsSeason.install)}</b></span>
              <span>Install pay <b className="tabular-nums">{fmt0(lightsSeason.installLabor)}</b> = {lightsSeason.install ? pctTag(lightsSeason.installLabor / lightsSeason.install, LIGHTS_INSTALL_TARGET) : '—'} <span className="text-slate-500">(goal {Math.round(LIGHTS_INSTALL_TARGET * 100)}%)</span></span>
              <span>Removal pay <b className="tabular-nums">{fmt0(lightsSeason.removalLabor)}</b> = {lightsSeason.install ? pctTag(lightsSeason.removalLabor / lightsSeason.install, LIGHTS_REMOVAL_TARGET) : '—'} <span className="text-slate-500">(goal {Math.round(LIGHTS_REMOVAL_TARGET * 100)}% of installed)</span></span>
            </div>
          )}
          <div className="overflow-x-auto">
            {(() => {
              // Simple by default: the five numbers that matter. "More columns" shows the rest.
              const gpOf = (h) => h.allRevenue - h.allCogs;
              const M = 'money', P = 'perf', L = 'labor', B = 'bonus', K = 'kept';
              const dot = (ok) => <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />;
              const scored = (v, ok, text) => <span className={`inline-flex items-center gap-1 font-semibold ${ok ? 'text-[#4d7c0f]' : 'text-red-600'}`}>{dot(ok)}{text}</span>;
              const pctIn = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '—');
              const cols = [
                // 1. Money: what came in, materials, and what's left to work with
                { k: 'in', g: M, label: 'Money in', title: 'All finished work, lawn + lights.', cell: (h) => fmt0(h.allRevenue) },
                { k: 'cogs', g: M, label: 'COGS', title: 'Materials + card fees, and the % of money in.', cell: (h) => <>{fmt0(h.allCogs)}<div className="text-[10px] text-slate-400">{pctIn(h.allCogs, h.allRevenue)}</div></> },
                { k: 'adj', g: M, label: 'Adjusted rev', title: 'Money in − COGS (gross profit).', cell: (h) => <span className="font-semibold">{fmt0(gpOf(h))}</span> },
                // 2. Team performance: is the crew doing good?
                { k: 'lawnbefore', g: P, label: 'Lawn % crew got', title: `How the crew actually did: lawn production wages ÷ lawn adjusted revenue, BEFORE the bonus. Under ${laborGoal}% = they beat the budget, and the gap is their bonus.`, cell: (h) => h.lawnBefore == null ? '—' : <>{scored(h.lawnBefore, h.lawnBefore <= laborGoal / 100 + 0.0005, pctFmt(h.lawnBefore))}{h.lawnBonus >= 0.5 && <div className="text-[10px] text-slate-400">earned {fmt0(h.lawnBonus)}</div>}</> },
                { k: 'labor', g: P, label: 'Lawn % after bonus', title: `Lawn labor after paying the bonus: lawn production wages + lawn bonus ÷ lawn adjusted revenue (exactly the lawn bonus math: straight-time production hours, so the OT extra-half isn't in it). Non-prod, lights and review bonuses left out. When the bonus pays, this lands right at ${laborGoal}%.`, cell: (h) => h.lawnCrew == null ? '—' : scored(h.lawnCrew, h.lawnCrew <= laborGoal / 100 + 0.0005, pctFmt(h.lawnCrew)) },
                ...(showLights ? [{ k: 'lights', g: P, label: '🎄 Lights %', title: `Lights labor: install pay ÷ install value. Goal ${Math.round(LIGHTS_INSTALL_TARGET * 100)}% or less.`, cell: (h) => { if (!h.lightsInstall) return h.lightsRemovalLabor > 0 ? <span className="text-[11px] text-slate-500">removal {fmt0(h.lightsRemovalLabor)}</span> : <span className="text-slate-300">—</span>; const lp = h.lightsInstallLabor / h.lightsInstall; return scored(lp, lp <= LIGHTS_INSTALL_TARGET, `${(lp * 100).toFixed(1)}%`); } }] : []),
                { k: 'total', g: P, label: 'Total %', title: 'All wages, lawn + lights (every hour: mowing, drive, non-prod, lights, OT) ÷ money in. No bonuses, no taxes.', cell: (h) => h.allRevenue > 0 ? <span className="font-semibold">{((h.wages / h.allRevenue) * 100).toFixed(1)}%</span> : '—' },
                { k: 'perhr', g: P, label: '$ / man-hr', title: `Rev per man-hour: money in ÷ production man-hours. Goal ${fmt0(goal)} or more.`, cell: (h) => { const r = rphOf(h); return r == null ? '—' : scored(r, goal && r >= goal, fmt0(r)); } },
                // 3. Labor: all wages, and how much of that was non-prod
                { k: 'np', g: L, label: '% of money in', title: 'Non-prod wages (shop, errands, your house: work you assign) ÷ money in. Part of Total %.', cell: (h) => h.npWages > 0 && h.allRevenue > 0 ? <span className="text-amber-700">{((h.npWages / h.allRevenue) * 100).toFixed(1)}%</span> : <span className="text-slate-300">—</span> },
                // 4. Bonuses paid, one column with the split under it
                { k: 'bonus', g: B, label: 'Bonuses', title: 'All bonuses paid: lawn pool + jobs, Christmas lights, and other (reviews, extras).', cell: (h) => { const parts = [h.lawnBonus >= 0.5 && `lawn ${fmt0(h.lawnBonus)}`, h.lightsBonus >= 0.5 && `🎄 ${fmt0(h.lightsBonus)}`, h.otherBonus >= 0.5 && `other ${fmt0(h.otherBonus)}`].filter(Boolean);
                  return h.bonus > 0 ? <><span className="font-semibold text-[#4d7c0f]">{fmt0(h.bonus)}</span>{parts.length > 1 && <div className="text-[10px] leading-tight text-slate-400">{parts.map((x) => <div key={x}>{x}</div>)}</div>}</> : <span className="text-slate-300">$0</span>; } },
                ...(histMore ? [
                  { g: B, k: 'hrs', label: 'Crew hours', cell: (h) => hmm(h.allMin) },
                  { g: B, k: 'prod', label: 'Prod hrs', title: 'Crew hours − non-prod', cell: (h) => hmm(h.prodAll) },
                  { g: B, k: 'lawnlabor', label: 'Lawn bonus labor', title: `Lawn production wages ÷ lawn gross profit — what the lawn bonus uses (target ${targetPct}%).`, cell: (h) => pctFmt(h.laborPct) },
                ] : []),
                // 5. Bottom line
                { k: 'kept', g: K, label: 'You kept', title: 'Money in − COGS − all wages − bonuses − employer taxes. Before overhead.', cell: (h) => { const m = madeOf(h); return <><span className={`font-bold ${m >= 0 ? 'text-[#4d7c0f]' : 'text-red-600'}`}>{fmt0(m)}</span>{h.allRevenue > 0 && <div className="text-[10px] text-slate-400">{((m / h.allRevenue) * 100).toFixed(0)}%</div>}</>; } },
              ];
              const GROUPS = { [M]: ['Money', 'bg-slate-100 text-slate-600'], [P]: ['Team performance', 'bg-emerald-50 text-emerald-800'], [L]: ['Non-prod (your call)', 'bg-amber-50 text-amber-800'], [B]: ['Paid out', 'bg-lime-50 text-[#3f6212]'], [K]: ['Bottom line', 'bg-[#0F2236] text-white'] };
              const spans = cols.reduce((acc, c) => { const last = acc[acc.length - 1]; if (last && last.g === c.g) last.n++; else acc.push({ g: c.g, n: 1 }); return acc; }, []);
              const tint = (g) => (g === P ? 'bg-emerald-50/50' : g === L ? 'bg-amber-50/30' : g === B ? 'bg-lime-50/30' : g === K ? 'bg-slate-50' : '');
              return (
                <>
                {(() => { const gs = history.map((h) => gradeOf(h.lawnCrew, rphOf(h))?.level).filter(Boolean); if (!gs.length) return null; const c = (l) => gs.filter((x) => x === l).length;
                  return <div className="border-b px-4 py-2 text-sm">Last {gs.length} weeks: <b className="text-emerald-700">{c('good')} good</b> · <b className="text-amber-700">{c('ok')} okay</b> · <b className="text-red-600">{c('bad')} rough</b></div>; })()}
                <table className="w-full text-sm [&_td]:!px-2 [&_th]:!px-2 [&_td:first-child]:!pl-3 [&_th:first-child]:!pl-3">
                  <thead>
                    <tr className="text-[11px] font-black uppercase tracking-wide">
                      <th className="bg-white" />{spans.map((sp) => <th key={sp.g} colSpan={sp.n} className={`border-x border-white px-3 py-1.5 text-center ${GROUPS[sp.g][1]}`}>{GROUPS[sp.g][0]}</th>)}
                    </tr>
                    <tr className="border-b bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 text-left">Week</th>{cols.map((c) => <th key={c.k} className={`${th} ${tint(c.g)}`} title={c.title}>{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 && <tr><td colSpan={cols.length + 1} className="px-3 py-6 text-center text-slate-400">Nothing logged yet.</td></tr>}
                    {history.map((h) => (
                      <tr key={h.week_ending} className={`border-b last:border-0 tabular-nums ${h.week_ending === week ? 'bg-[#B0FF03]/10' : ''}`}>
                        <td className="whitespace-nowrap px-3 py-2"><Link to={`/payroll/${h.week_ending}`} className="font-semibold hover:underline">{new Date(h.week_ending + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Link>{h.crews > 1 && <span className="ml-1 text-xs text-slate-400">· {h.crews} crews</span>}
                          {!h.closed && h.week_ending < thisWeek && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">Open</span>}
                          {(() => { const g = gradeOf(h.lawnCrew, rphOf(h)); return g ? <div><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${GRADE_STYLE[g.level]}`}>{g.label}</span></div> : null; })()}</td>
                        {cols.map((c) => <td key={c.k} className={`${th} ${tint(c.g)}`}>{c.cell(h)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                  {history.length > 1 && <tfoot><tr className="border-t-2 bg-slate-50 font-bold tabular-nums">
                    <td className="px-3 py-2">{history.length} weeks{(() => { const g = gradeOf(hTotals.lawnCrew, rphOf(hTotals)); return g ? <div><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${GRADE_STYLE[g.level]}`}>{g.label}</span></div> : null; })()}</td>{cols.map((c) => <td key={c.k} className={`${th} ${tint(c.g)}`}>{c.cell(hTotals)}</td>)}
                  </tr></tfoot>}
                </table>
                </>
              );
            })()}
          </div>
          <div className="border-t px-4 py-2 text-xs"><button onClick={() => setHistMore((v) => !v)} className="font-semibold text-slate-500 hover:text-slate-800">{histMore ? '− Fewer columns' : '+ More columns'}</button></div>
          {/* plain-English key for every number in the table */}
          <div className="border-t bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
            <div className="mb-1 font-bold text-slate-700">What these numbers mean</div>
            <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
              <div><b>Adjusted rev</b> = money in − COGS (materials + card fees).</div>
              <div><b>Lawn % crew got</b> = lawn production wages ÷ lawn adjusted rev, before the bonus: how the crew actually did. Under {laborGoal}% earns a bonus. <b>Lawn % after bonus</b> = lawn production wages + lawn bonus ÷ lawn adjusted rev. Non-prod, lights and reviews left out. The bonus tops it up to {laborGoal}%, so <b>{laborGoal}% = on budget</b>, over = crew ran over.</div>
              <div><b>🎄 Lights %</b> = lights hours pay + lights bonus ÷ lights installed. Goal {Math.round(LIGHTS_INSTALL_TARGET * 100)}% or less.</div>
              <div><b>Total %</b> = all wages (every hour: lawn, lights, drive time, non-prod, OT) ÷ money in. <b>No bonuses, no taxes.</b></div>
              <div><b>$ / man-hr</b> = money in ÷ everyone's production hours added together. Goal {fmt0(goal)} or more.</div>
              <div><b>Non-prod</b> = shop, errands, your house (work you assign) ÷ money in. Already inside Total %.</div>
              <div><b>Bonuses</b> = lawn weekly + finished jobs, 🎄 lights, and other (reviews, extras).</div>
              <div><b>You kept</b> = money in − COGS − all wages − all bonuses − employer taxes. Before overhead.</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// The score at the end of each day: rev/hr, how it compares to the goal, and what's left after COGS.
function EndOfDay({ rph, rev, min, goal }) {
  const tone = toneOf(rph, goal), tn = TONES[tone];
  const pct = rph != null && goal ? Math.min(100, (rph / goal) * 100) : 0;
  const note = rph == null ? (rev ? (min ? 'All hours are non-prod' : 'Add crew hours to score the day') : min ? 'Add revenue to score the day' : 'No work logged')
    : goal ? `${fmt0(Math.abs(rph - goal))}/hr ${rph >= goal ? 'over' : 'under'} the ${fmt0(goal)} goal` : 'Set a rev/hr goal at the top';
  return (
    <div className={`shrink-0 rounded-lg border p-3 md:w-60 ${tn.box}`}>
      <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">End of day</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tn.pill}`}>{tn.label}</span></div>
      <div className={`mt-1 text-3xl font-black tabular-nums leading-tight ${tn.text}`}>{rph == null ? '—' : fmt0(rph)}<span className="ml-1 text-xs font-semibold text-slate-500">{rph == null ? '' : 'rev / man-hr'}</span></div>
      {goal > 0 && <div className="relative mt-2 h-2 rounded-full bg-white/80 ring-1 ring-black/5"><div className={`h-full rounded-full transition-all ${tn.bar}`} style={{ width: `${pct}%` }} /></div>}
      <div className="mt-1.5 text-[11px] text-slate-600 tabular-nums">{note}</div>
    </div>
  );
}

function Tile({ label, value, sub, tone, big }) {
  const color = tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-[#4d7c0f]' : 'text-slate-900';
  return (
    <div className={`bg-white p-4 ${big ? 'md:col-span-1' : ''}`}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-black tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

const Group = ({ children }) => <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{children}</div>;

// One line of a stacked math problem: operator, label, value; `rule` draws the line above a total.
function mathLine(op, label, value, { bold, tone, sub, rule } = {}) {
  return (
    <div className={`grid grid-cols-[1.5rem_minmax(0,1fr)_8rem] items-baseline gap-x-2 py-1 ${rule ? 'border-t-2 border-slate-800 mt-1 pt-1.5' : ''}`}>
      <span className="text-center font-bold text-slate-400">{op}</span>
      <span className={bold ? 'font-bold' : 'text-slate-600'}>{label}{sub && <span className="ml-2 text-xs font-normal text-slate-400">{sub}</span>}</span>
      <span className={`text-right tabular-nums ${bold ? 'font-bold' : ''} ${tone === 'good' ? 'text-[#4d7c0f]' : tone === 'bad' ? 'text-red-600' : ''}`}>{value}</span>
    </div>
  );
}

// One click copies just the number (no $ or commas), ready to paste into payroll.
function CopyChip({ label, value, prefix = '' }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* clipboard blocked — the number is still on screen */ }
  };
  return (
    <button type="button" onClick={copy} title={`Copy ${label.toLowerCase()}`} className="rounded-md border bg-slate-50 px-2 py-1 text-left hover:border-[#4d7c0f] hover:bg-white">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}{done ? <Check size={11} className="text-[#4d7c0f]" /> : <Copy size={11} />}</div>
      <div className="text-sm font-bold tabular-nums">{done ? 'Copied' : `${prefix}${value}`}</div>
    </button>
  );
}

function TimeCell({ value, onChange }) {
  const min = parseTime(value); const bad = min == null;
  return (
    // The decimal sits inside the box, on the left, so it reads as the same number.
    <div className="relative">
      <input className={`${cell} min-w-[6.5rem] pl-14 ${bad ? 'border-red-400' : ''}`} placeholder="h:mm" value={value} onChange={onChange} />
      <span className={`pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] tabular-nums ${bad ? 'text-red-600' : 'text-slate-400'}`}>{bad ? 'h:mm?' : min > 0 ? `${minutesToDecimal(min)} h` : ''}</span>
    </div>
  );
}

function Field({ label, hint, prefix, children }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{prefix}</span>}
        <div className={prefix ? '[&>input]:pl-7' : ''}>{children}</div>
      </div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </label>
  );
}
