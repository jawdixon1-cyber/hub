import ical from 'node-ical';
import { jobberQuery } from '../lib/jobberClient.js';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { accessToken } from './gmail.js';

// GET /api/plan-day?date=YYYY-MM-DD → what's on that day (owner only):
//   visits: Jobber visits for the whole crew
//   events: Google Calendar events from each calendar's private iCal address
// Env CALENDAR_ICS_URLS = "Work|https://calendar.google.com/…/basic.ics,Personal|https://…/basic.ics"
// (Google Calendar → Settings → the calendar → Integrate calendar → "Secret address in iCal format").

const TZ = 'America/New_York';
const ymd = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
function easternMidnight(dateStr) {
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const off = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(probe).find((p) => p.type === 'timeZoneName')?.value.replace('GMT', '') || '-05:00';
  return new Date(`${dateStr}T00:00:00${off || 'Z'}`);
}
const addDays = (dateStr, n) => { const d = new Date(`${dateStr}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function calendars() {
  return String(process.env.CALENDAR_ICS_URLS || '').split(',').map((s) => s.trim()).filter(Boolean).map((s, i) => {
    const [label, ...rest] = s.split('|');
    const url = rest.length ? rest.join('|') : label;
    return { label: rest.length ? label.trim() : `Calendar ${i + 1}`, url: url.trim() };
  }).filter((c) => /^https:\/\//.test(c.url));
}

const icsCache = new Map(); // url → { at, data }
async function loadIcs(url) {
  const hit = icsCache.get(url);
  if (hit && Date.now() - hit.at < 5 * 60e3) return hit.data;
  const data = await ical.async.fromURL(url);
  icsCache.set(url, { at: Date.now(), data });
  return data;
}

// Events that touch [start, end), recurring ones expanded, cancelled/moved instances handled.
function eventsInRange(data, start, end, label) {
  const out = [];
  const push = (ev, s, e) => {
    const allDay = ev.datetype === 'date';
    out.push({ id: `${ev.uid}-${s.toISOString()}`, title: ev.summary || '(no title)', start: s.toISOString(), end: (e || s).toISOString(), allDay, calendar: label, location: ev.location || '' });
  };
  for (const ev of Object.values(data)) {
    if (ev.type !== 'VEVENT' || ev.status === 'CANCELLED') continue;
    const dur = ev.end && ev.start ? new Date(ev.end) - new Date(ev.start) : 0;
    if (ev.rrule) {
      const from = new Date(start.getTime() - Math.max(dur, 864e5));
      for (const occ of ev.rrule.between(from, end, true)) {
        const key = occ.toISOString().slice(0, 10);
        if (ev.exdate && Object.keys(ev.exdate).some((k) => k.startsWith(key))) continue;
        const moved = ev.recurrences && Object.entries(ev.recurrences).find(([k]) => k.startsWith(key))?.[1];
        const s = moved ? new Date(moved.start) : occ;
        const e = moved ? new Date(moved.end || moved.start) : new Date(occ.getTime() + dur);
        if (e > start && s < end) push(moved || ev, s, e);
      }
    } else if (ev.start) {
      const s = new Date(ev.start);
      const e = ev.end ? new Date(ev.end) : s;
      if (e > start && s < end) push(ev, s, e);
    }
  }
  return out;
}

export default async function handler(req, res) {
  const db = getSupabaseAdmin();
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const { data: who } = token ? await db.auth.getUser(token) : { data: null };
  if (who?.user?.user_metadata?.role !== 'owner') return res.status(401).json({ error: 'Log in to the Hub as the owner first.' });

  // ?upcoming=1 → the next 7 days of Jobber visits (Social media tab picks filming jobs from these).
  if (req.query?.upcoming) {
    const from = easternMidnight(ymd(new Date()));
    const to = easternMidnight(addDays(ymd(new Date()), 7));
    try {
      const d = await jobberQuery(`{ visits(first: 100, filter: { startAt: { after: "${from.toISOString()}", before: "${to.toISOString()}" } }) {
        nodes { id title startAt client { name } } } }`);
      const seen = new Set();
      const visits = (d.visits?.nodes || []).map((v) => ({ id: v.id, title: v.title || '', client: v.client?.name || '', start: v.startAt }))
        .filter((v) => { const k = `${v.client}|${ymd(v.start)}`; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => new Date(a.start) - new Date(b.start));
      return res.json({ visits });
    } catch (e) { return res.status(502).json({ error: /THROTTLED/i.test(e.message) ? 'Jobber is busy. Try again in a minute.' : e.message }); }
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query?.date || '')) ? req.query.date : ymd(new Date());
  const start = easternMidnight(date);
  const endExcl = easternMidnight(addDays(date, 1));
  const errors = {};

  const visitsP = jobberQuery(`{ visits(first: 80, filter: { startAt: { after: "${start.toISOString()}", before: "${new Date(endExcl.getTime() - 1000).toISOString()}" } }) {
    nodes { id title startAt endAt allDay isComplete overrideOrder assignedUsers(first: 4) { nodes { name { full } } } client { name } property { address { street city } } job { jobberWebUri } } } }`)
    .then((d) => (d.visits?.nodes || []).filter((v) => ymd(v.startAt) === date).map((v) => ({
      id: v.id, title: v.title || '', client: v.client?.name || '', start: v.startAt, end: v.endAt, allDay: !!v.allDay, done: !!v.isComplete,
      order: v.overrideOrder ?? 9999, crew: (v.assignedUsers?.nodes || []).map((u) => u.name?.full).filter(Boolean),
      address: [v.property?.address?.street, v.property?.address?.city].filter(Boolean).join(', '), url: v.job?.jobberWebUri || null,
    })).sort((a, b) => (a.allDay !== b.allDay ? (a.allDay ? -1 : 1) : a.allDay ? a.order - b.order : new Date(a.start) - new Date(b.start))))
    .catch((e) => { errors.jobber = /THROTTLED/i.test(e.message) ? 'Jobber is busy. Refresh in a minute.' : e.message; return []; });

  const cals = calendars();
  const eventsP = Promise.all(cals.map((c) => loadIcs(c.url)
    .then((data) => eventsInRange(data, start, endExcl, c.label))
    .catch((e) => { errors[`calendar:${c.label}`] = `Couldn't load ${c.label} calendar: ${e.message}`; return []; })))
    .then((lists) => lists.flat().sort((a, b) => (a.allDay !== b.allDay ? (a.allDay ? -1 : 1) : new Date(a.start) - new Date(b.start))));

  // Work calendar(s) through the Google sign-in used for work email (Workspace hides secret iCal links).
  const { data: accts } = await db.from('app_state').select('key').like('key', 'gmail-acct:%');
  const signedIn = (accts || []).map((r) => r.key.slice('gmail-acct:'.length));
  const apiEventsP = Promise.all(signedIn.map(async (email) => {
    try {
      const tokenFor = await accessToken(db, email);
      const qs = new URLSearchParams({ timeMin: start.toISOString(), timeMax: endExcl.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '50' });
      const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${qs}`, { headers: { Authorization: `Bearer ${tokenFor}` } });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) {
        errors[`calendar:${email}`] = r.status === 403 && /scope|insufficient/i.test(JSON.stringify(b))
          ? 'Work calendar: tap Connect Gmail again on the Email step to add calendar access.'
          : r.status === 403 && /not been used|disabled/i.test(JSON.stringify(b))
            ? 'Work calendar: turn on the Google Calendar API in Google Cloud.'
            : `Work calendar: ${b.error?.message || r.status}`;
        return [];
      }
      const label = /judeslawncare|heyjudes/i.test(email) ? 'Work' : email;
      return (b.items || []).filter((e) => e.status !== 'cancelled').map((e) => {
        const allDay = !!e.start?.date;
        const s = allDay ? easternMidnight(e.start.date) : new Date(e.start?.dateTime);
        const en = allDay ? easternMidnight(e.end?.date || e.start.date) : new Date(e.end?.dateTime || e.start?.dateTime);
        return { id: `${email}-${e.id}`, title: e.summary || '(no title)', start: s.toISOString(), end: en.toISOString(), allDay, calendar: label, location: e.location || '' };
      });
    } catch (e) { errors[`calendar:${email}`] = `Work calendar: ${e.message}`; return []; }
  })).then((l) => l.flat());

  // Jobber tasks for that day (everyone's; Jude's are marked on the page).
  const tasksP = jobberQuery(`{ tasks(first: 50, filter: { startAt: { after: "${start.toISOString()}", before: "${new Date(endExcl.getTime() - 1000).toISOString()}" } }) {
    nodes { id title startAt allDay isComplete assignedUsers(first: 4) { nodes { name { full } } } client { name } } } }`)
    .then((d) => (d.tasks?.nodes || []).filter((t) => ymd(t.startAt) === date).map((t) => ({
      id: t.id, title: t.title || 'Task', start: t.startAt, allDay: !!t.allDay, done: !!t.isComplete,
      crew: (t.assignedUsers?.nodes || []).map((u) => u.name?.full).filter(Boolean), client: t.client?.name || '',
    })))
    .catch((e) => { errors.jobberTasks = /THROTTLED/i.test(e.message) ? 'Jobber tasks: busy, refresh in a minute.' : `Jobber tasks: ${e.message}`; return []; });

  // Open Jobber requests (new + overdue): people waiting on a call or quote.
  const requestsP = Promise.all(['new', 'overdue'].map((st) => jobberQuery(`{ requests(first: 25, filter: { status: ${st} }) {
      nodes { id title createdAt requestStatus jobberWebUri contactName phone client { name phones { number primary } } } } }`)))
    .then((rs) => {
      const seen = new Set();
      return rs.flatMap((d) => d.requests?.nodes || []).filter((r) => !seen.has(r.id) && seen.add(r.id)).map((r) => ({
        id: r.id, title: r.title && r.title !== 'Request' ? r.title : '', createdAt: r.createdAt, overdue: r.requestStatus === 'overdue',
        name: r.client?.name || r.contactName || 'New lead',
        phone: r.phone || (r.client?.phones || []).find((p) => p.primary)?.number || r.client?.phones?.[0]?.number || null,
        url: r.jobberWebUri,
      })).sort((a, b) => (a.overdue !== b.overdue ? (a.overdue ? -1 : 1) : new Date(b.createdAt) - new Date(a.createdAt)));
    })
    .catch((e) => { errors.requests = /THROTTLED/i.test(e.message) ? 'Requests: Jobber is busy, refresh in a minute.' : `Requests: ${e.message}`; return []; });

  // Requests scheduled for that day = Jobber assessments.
  const assessP = jobberQuery(`{ scheduledItems(first: 30, filter: { scheduleItemType: ASSESSMENT, includeUnassigned: true, occursWithin: { startAt: "${start.toISOString()}", endAt: "${new Date(endExcl.getTime() - 1000).toISOString()}" } }) {
      nodes { ... on Assessment { id title startAt endAt allDay isComplete client { name } property { address { street city } } request { jobberWebUri } assignedUsers(first: 4) { nodes { name { full } } } } } } }`)
    .then((d) => (d.scheduledItems?.nodes || []).filter((a) => a.id && ymd(a.startAt) === date).map((a) => ({
      id: a.id, title: a.title || 'Assessment', client: a.client?.name || '', start: a.startAt, end: a.endAt, allDay: !!a.allDay, done: !!a.isComplete,
      address: [a.property?.address?.street, a.property?.address?.city].filter(Boolean).join(', '), url: a.request?.jobberWebUri || null,
      crew: (a.assignedUsers?.nodes || []).map((u) => u.name?.full).filter(Boolean),
    })))
    .catch((e) => { errors.assessments = /THROTTLED/i.test(e.message) ? 'Assessments: Jobber is busy, refresh in a minute.' : `Assessments: ${e.message}`; return []; });

  const [visits, icsEvents, apiEvents, tasks, requests, assessments] = await Promise.all([visitsP, eventsP, apiEventsP, tasksP, requestsP, assessP]);
  const events = [...icsEvents, ...apiEvents].sort((a, b) => (a.allDay !== b.allDay ? (a.allDay ? -1 : 1) : new Date(a.start) - new Date(b.start)));
  return res.json({ date, visits, events, tasks, requests, assessments, calendarsConnected: [...cals.map((c) => c.label), ...signedIn.map((e) => (/judeslawncare|heyjudes/i.test(e) ? 'Work' : e))], errors });
}
