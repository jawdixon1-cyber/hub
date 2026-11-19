import { jobberQuery } from '../lib/jobberClient.js';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { planMoney } from './jobber-data.js';

// GET /api/jobber-today → everything for the end-of-day Jobber step (owner only):
//   today:    visits, assessments, tasks, events scheduled today
//   requests: new + overdue requests (people to call)
//   invoice:  jobs that need invoicing + draft invoices
//   overdue:  missed visits/tasks/assessments (last 60 days) + past-due invoices
// Each section is its own Jobber query so one failure doesn't blank the page.
// Cached 2 minutes; ?fresh=1 skips the cache.

const TTL = 2 * 60e3;
let cache = { at: 0, data: null };
let crewCache = { at: 0, data: null }; // today's stops only, for the crew

const clientBits = 'client { id name phones { number primary } }';
const clientLite = 'client { name }';
const placeBits = 'property { address { street city coordinates { latitudeString longitudeString } } }';
const crewBits = 'assignedUsers(first: 4) { nodes { name { full } } }';

const phoneOf = (c) => (c?.phones || []).find((p) => p.primary)?.number || c?.phones?.[0]?.number || null;
const addrOf = (p) => [p?.address?.street, p?.address?.city].filter(Boolean).join(', ');
const crewOf = (n) => (n?.assignedUsers?.nodes || []).map((u) => u.name?.full).filter(Boolean);
const webUri = (n) => n.jobberWebUri || n.job?.jobberWebUri || n.request?.jobberWebUri || null;

function scheduledQuery(filter) {
  return `{
    scheduledItems(first: 40, filter: ${filter}) {
      nodes {
        __typename id title startAt endAt allDay ${crewBits}
        ... on Visit { isComplete ${clientLite} ${placeBits} job { jobNumber jobberWebUri } lineItems(first: 10) { nodes { totalPrice } } }
        ... on Assessment { isComplete ${clientLite} ${placeBits} request { jobberWebUri } }
        ... on Task { isComplete ${clientLite} }
        ... on Event { isComplete }
      }
    }
  }`;
}
const mapScheduled = (n) => ({
  id: n.id,
  type: n.__typename, // Visit | Assessment | Task | Event | QuoteReminder | InvoiceReminder
  title: n.title || n.__typename,
  startAt: n.startAt,
  endAt: n.endAt,
  allDay: !!n.allDay,
  done: !!n.isComplete,
  client: n.client?.name || null,
  phone: phoneOf(n.client),
  address: addrOf(n.property),
  lat: Number(n.property?.address?.coordinates?.latitudeString) || null,
  lng: Number(n.property?.address?.coordinates?.longitudeString) || null,
  crew: crewOf(n),
  jobNumber: n.job?.jobNumber || null,
  value: (n.lineItems?.nodes || []).reduce((s, li) => s + (Number(li.totalPrice) || 0), 0),
  url: webUri(n),
});

// Everything is Hey Jude's local time (Eastern), whatever timezone the server runs in.
const TZ = 'America/New_York';
const ymd = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD in Eastern
function easternMidnight(dateStr) {
  // Find the Eastern UTC offset on that date (handles EST/EDT), then build midnight there.
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const off = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(probe).find((p) => p.type === 'timeZoneName')?.value.replace('GMT', '') || '-05:00';
  return new Date(`${dateStr}T00:00:00${off === '' ? 'Z' : off}`);
}
const addDays = (dateStr, n) => { const d = new Date(`${dateStr}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const day = () => easternMidnight(ymd(new Date()));

// Jobber rate-limits by query cost; on THROTTLED wait for the bucket to refill and retry.
async function section(name, fn, errors) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await fn(); } catch (e) {
      if (/THROTTLED/i.test(e.message) && attempt < 2) { await new Promise((ok) => setTimeout(ok, 3000 * (attempt + 1))); continue; }
      errors[name] = /THROTTLED/i.test(e.message) ? 'Jobber is busy (rate limit). Refresh in a minute.' : e.message;
      return null;
    }
  }
  return null;
}

async function build({ onlyToday = false } = {}) {
  const errors = {};
  const todayStr = ymd(new Date());
  const start = day();
  // Jobber's range is inclusive, so stop 1 second before midnight or tomorrow's all-day items leak in.
  const end = new Date(easternMidnight(addDays(todayStr, 1)).getTime() - 1000);
  const past = easternMidnight(addDays(todayStr, -60));

  // Today: every visit (all crew — scheduledItems only returns the signed-in user's), plus
  // assessments and events from scheduledItems. Visit value matches Jobber's "Today's appointments":
  // line items on per-visit-billed jobs only (plans billed monthly count $0 per visit).
  let duplicates = [];
  const today = await section('today', async () => {
    const [v, sch, tk] = await Promise.all([
      jobberQuery(`{ visits(first: 60, filter: { startAt: { after: "${start.toISOString()}", before: "${end.toISOString()}" } }) {
        nodes { id title startAt endAt allDay isComplete completedAt overrideOrder routingOrder ${crewBits} client { name } ${placeBits}
          lineItems(first: 10) { nodes { totalPrice } }
          invoice { invoiceNumber invoiceStatus jobberWebUri amounts { invoiceBalance } }
          job { invoices(last: 2) { nodes { invoiceNumber invoiceStatus issuedDate jobberWebUri amounts { invoiceBalance } } }
            jobNumber jobberWebUri billingType jobType jobStatus total
            lineItems(first: 10) { nodes { quantity totalPrice } }
            visitSchedule { recurrenceSchedule { friendly } } invoiceSchedule { scheduleSummary }
            visits(first: 1) { totalCount } } } } }`),
      jobberQuery(scheduledQuery(`{ occursWithin: { startAt: "${start.toISOString()}", endAt: "${end.toISOString()}" } }`)),
      // Today's tasks for everyone (scheduledItems only returns the signed-in user's).
      jobberQuery(`{ tasks(first: 50, filter: { startAt: { after: "${start.toISOString()}", before: "${end.toISOString()}" } }) {
        nodes { id title startAt endAt allDay isComplete overrideOrder ${crewBits} client { name } } } }`),
    ]);
    const visits = (v.visits?.nodes || []).filter((n) => ymd(n.startAt) === todayStr).map((n) => {
      const perVisitBilled = n.job?.billingType === 'VISIT_BASED';
      const value = perVisitBilled ? (n.lineItems?.nodes || []).reduce((t, li) => t + (Number(li.totalPrice) || 0), 0) : 0;
      // Not billed per visit: work out what this visit is worth.
      //   monthly plans → monthly price ÷ visits a month (same math as Client Base)
      //   one-time fixed-price jobs → job total ÷ number of visits
      let est = 0, estHow = '', pending = false;
      if (!perVisitBilled && n.job) {
        if (n.job.jobType === 'RECURRING') {
          const pm = planMoney(n.job);
          if (pm.perVisit) { est = pm.perVisit; estHow = pm.monthly ? `$${pm.monthly}/mo ÷ ${pm.freq || 'visits'}` : 'plan'; }
        } else if (['archived', 'requires_invoicing'].includes(n.job.jobStatus)) {
          // One-time job that's closed: the job total split over its visits.
          const count = n.job.visits?.totalCount || 1;
          est = Math.round(((Number(n.job.total) || 0) / count) * 100) / 100;
          estHow = count > 1 ? `job total ÷ ${count} visits` : 'job total';
        } else {
          // One-time job still open: we don't know what it's worth per visit yet.
          pending = true;
        }
      }
      // Is it paid? Per-visit jobs: this visit's invoice. Plans / one-time jobs: the job's latest invoice.
      const inv = perVisitBilled ? n.invoice
        : [...(n.job?.invoices?.nodes || [])].sort((a, b) => String(b.issuedDate || '').localeCompare(String(a.issuedDate || '')))[0] || null;
      const bal = Number(inv?.amounts?.invoiceBalance) || 0;
      const paid = !inv ? { state: 'unbilled', label: 'Not billed yet' }
        : inv.invoiceStatus === 'paid' || (bal === 0 && inv.invoiceStatus !== 'draft') ? { state: 'paid', label: perVisitBilled ? 'Paid' : n.job?.jobType === 'RECURRING' ? `Plan paid (${new Date(inv.issuedDate).toLocaleDateString('en-US', { timeZone: TZ, month: 'short' })})` : 'Paid' }
        : inv.invoiceStatus === 'draft' ? { state: 'draft', label: 'Draft invoice' }
        : { state: inv.invoiceStatus === 'past_due' ? 'pastdue' : 'due', label: `$${bal.toFixed(2)} ${inv.invoiceStatus === 'past_due' ? 'past due' : 'due'}` };
      paid.invoiceNumber = inv?.invoiceNumber || null;
      paid.url = inv?.jobberWebUri || null;
      return { ...mapScheduled({ ...n, __typename: 'Visit' }), route: n.overrideOrder ?? null, completedAt: n.completedAt || null, value, est, estHow, pending, paid, billedMonthly: !perVisitBilled };
    });
    // Reopening a job in Jobber can add a second visit for today on a job that was already
    // completed today. Those duplicates are left out of the list and the money (shown as a note).
    const doneJobs = new Set(visits.filter((x) => x.done && x.jobNumber).map((x) => x.jobNumber));
    duplicates = visits.filter((x) => !x.done && x.jobNumber && doneJobs.has(x.jobNumber));
    const realVisits = visits.filter((x) => !duplicates.includes(x));
    const others = (sch.scheduledItems?.nodes || [])
      .filter((n) => ['Assessment', 'Event'].includes(n.__typename) && ymd(n.startAt) === todayStr)
      .map((n) => ({ ...mapScheduled(n), value: 0 }));
    // Route order: all-day stops in Jobber's schedule order (overrideOrder = the order on the
    // calendar, which matches the order they were done), then timed stops by time.
    const ro = (x) => (x.route == null ? 9999 : x.route);
    const tasks = (tk.tasks?.nodes || []).filter((n) => ymd(n.startAt) === todayStr)
      .map((n) => ({ ...mapScheduled({ ...n, __typename: 'Task' }), route: n.overrideOrder ?? null, value: 0 }));
    return [...realVisits, ...others, ...tasks]
      .sort((a, b) => (a.allDay !== b.allDay ? (a.allDay ? -1 : 1) : a.allDay ? ro(a) - ro(b) : new Date(a.startAt) - new Date(b.startAt)));
  }, errors);

  // Crew "Review jobs" only needs today's stops — skip the money/invoice/labor queries.
  if (onlyToday) return { today, errors };

  // Money for today: appointment value (like Jobber) + payments that actually came in today.
  const now = Date.now();
  const money = today ? (() => {
    const vis = today.filter((x) => x.type === 'Visit');
    const sum = (list) => Math.round(list.reduce((t, x) => t + (x.value || 0), 0) * 100) / 100;
    const sumAll = (list) => Math.round(list.reduce((t, x) => t + (x.value || 0) + (x.est || 0), 0) * 100) / 100;
    const completed = vis.filter((x) => x.done);
    const open = vis.filter((x) => !x.done);
    const overdue = open.filter((x) => !x.allDay && x.endAt && new Date(x.endAt).getTime() < now);
    const remaining = open.filter((x) => !overdue.includes(x));
    const byCrew = {};
    // A visit worked by two people counts half to each, so the crew totals add up to the day.
    for (const x of vis) {
      const names = x.crew.length ? x.crew : ['Unassigned'];
      const share = ((x.value || 0) + (x.est || 0)) / names.length;
      for (const name of names) {
        const r = byCrew[name] || (byCrew[name] = { name, visits: 0, done: 0, value: 0, completed: 0, pending: [] });
        if (x.pending) r.pending.push(x.client || x.title);
        r.visits += 1; r.value += share;
        if (x.done) { r.done += 1; r.completed += share; }
      }
    }
    for (const r of Object.values(byCrew)) { r.value = Math.round(r.value * 100) / 100; r.completed = Math.round(r.completed * 100) / 100; }
    return {
      total: sum(vis), completed: sum(completed), remaining: sum(remaining), overdue: sum(overdue),
      // Everything, monthly plans + one-time jobs included (estimated per visit).
      all: { total: sumAll(vis), completed: sumAll(completed), remaining: sumAll(remaining), overdue: sumAll(overdue) },
      visits: vis.length, visitsDone: completed.length,
      byCrew: Object.values(byCrew).sort((a, b) => b.completed - a.completed || b.value - a.value),
    };
  })() : null;

  // Labor today: Jobber timesheet hours × each person's hourly rate (Payroll), by crew member.
  const labor = await section('labor', async () => {
    const d = await jobberQuery(`{ timeSheetEntries(first: 100, filter: { startAt: { after: "${start.toISOString()}", before: "${end.toISOString()}" } }) {
      nodes { startAt endAt finalDuration ticking user { name { full } } } } }`);
    // Same rates Payroll uses: the Team page (greenteam-permissions → payRate). Owner is paid by draw.
    const PAID_BY_DRAW = new Set(['jawdixon1@gmail.com']);
    const { data: perm } = await getSupabaseAdmin().from('app_state').select('value').eq('key', 'greenteam-permissions').maybeSingle();
    const team = Object.entries(perm?.value || {})
      .filter(([email]) => !PAID_BY_DRAW.has(email.toLowerCase()))
      .map(([, v]) => ({ name: String(v.name || '').trim().toLowerCase(), rate: Number(v.payRate) || 0 }))
      .filter((t) => t.name && t.rate > 0);
    const rateFor = (full) => {
      const f = String(full || '').trim().toLowerCase();
      const r = team.find((x) => x.name === f) || team.find((x) => x.name.split(' ')[0] === f.split(' ')[0]);
      return r ? r.rate : null; // null = not on payroll (e.g. owner on a draw)
    };
    const by = {};
    for (const e of d.timeSheetEntries?.nodes || []) {
      const name = e.user?.name?.full || 'Unknown';
      const secs = e.ticking || !e.endAt ? Math.max(0, (Date.now() - new Date(e.startAt)) / 1000) : Number(e.finalDuration) || 0;
      (by[name] ||= { name, hours: 0, ticking: false }).hours += secs / 3600;
      if (e.ticking) by[name].ticking = true;
    }
    return Object.values(by).map((x) => {
      const rate = rateFor(x.name);
      return { ...x, hours: Math.round(x.hours * 100) / 100, rate, cost: rate == null ? null : Math.round(x.hours * rate * 100) / 100 };
    });
  }, errors);

  const payments = await section('payments', async () => {
    const d = await jobberQuery(`{ paymentRecords(first: 50, filter: { entryDate: { after: "${start.toISOString()}", before: "${end.toISOString()}" } }) {
      nodes { id amount entryDate paymentType client { name } invoice { invoiceNumber } } } }`);
    const list = (d.paymentRecords?.nodes || []).map((p) => ({
      id: p.id, amount: Number(p.amount) || 0, at: p.entryDate, type: p.paymentType || '',
      client: p.client?.name || '', invoiceNumber: p.invoice?.invoiceNumber || null,
    })).sort((a, b) => (a.type ? 0 : 1) - (b.type ? 0 : 1) || new Date(b.at) - new Date(a.at));
    // Jobber logs a card payment twice (the card record + an "other" record on the same invoice).
    // Keep one per invoice + amount, preferring the real payment record.
    const seen = new Set();
    const uniq = list.filter((p) => { const k = `${p.invoiceNumber || p.id}|${p.amount}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => new Date(b.at) - new Date(a.at));
    return { total: Math.round(uniq.reduce((t, p) => t + p.amount, 0) * 100) / 100, list: uniq };
  }, errors);

  const lateItems = await section('overdue', async () => {
    const d = await jobberQuery(scheduledQuery(`{ status: OVERDUE, occursWithin: { startAt: "${past.toISOString()}", endAt: "${new Date(start.getTime() - 1000).toISOString()}" } }`));
    return (d.scheduledItems?.nodes || [])
      .filter((n) => !/Reminder$/.test(n.__typename) && n.__typename !== 'Task') // tasks live in their own step
      .map(mapScheduled)
      .sort((a, b) => new Date(b.startAt) - new Date(a.startAt));
  }, errors);

  const requests = await section('requests', async () => {
    const q = (status) => jobberQuery(`{
      requests(first: 30, filter: { status: ${status} }) {
        nodes { id title createdAt requestStatus jobberWebUri contactName phone ${clientBits} ${placeBits} source }
      }
    }`);
    const [a, b] = await Promise.all([q('new'), q('overdue')]);
    const seen = new Set();
    return [...(a.requests?.nodes || []), ...(b.requests?.nodes || [])]
      .filter((r) => !seen.has(r.id) && seen.add(r.id))
      .map((r) => ({
        id: r.id,
        title: r.title || 'Request',
        status: r.requestStatus,
        createdAt: r.createdAt,
        client: r.client?.name || r.contactName || 'New lead',
        phone: r.phone || phoneOf(r.client),
        address: addrOf(r.property),
        source: r.source || null,
        url: r.jobberWebUri,
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, errors);

  const toInvoice = await section('invoice', async () => {
    const [jobs, drafts] = await Promise.all([
      jobberQuery(`{ jobs(first: 40, filter: { status: requires_invoicing }) {
        nodes { id jobNumber title jobberWebUri uninvoicedTotal completedAndUninvoicedVisitsCount ${clientBits} } } }`),
      jobberQuery(`{ invoices(first: 30, filter: { status: draft }) {
        nodes { id invoiceNumber subject jobberWebUri createdAt amounts { total } ${clientBits} } } }`),
    ]);
    return [
      ...(jobs.jobs?.nodes || []).map((j) => ({
        id: j.id, kind: 'job', label: `Job #${j.jobNumber}`, title: j.title || '',
        client: j.client?.name || '', amount: j.uninvoicedTotal ?? null,
        visits: j.completedAndUninvoicedVisitsCount ?? null, url: j.jobberWebUri,
      })),
      ...(drafts.invoices?.nodes || []).map((i) => ({
        id: i.id, kind: 'draft', label: `Draft invoice${i.invoiceNumber ? ` #${i.invoiceNumber}` : ''}`, title: i.subject || '',
        client: i.client?.name || '', amount: i.amounts?.total ?? null, url: i.jobberWebUri,
      })),
    ];
  }, errors);

  const pastDue = await section('pastDue', async () => {
    const d = await jobberQuery(`{ invoices(first: 40, filter: { status: past_due }) {
      nodes { id invoiceNumber subject dueDate jobberWebUri amounts { total invoiceBalance } ${clientBits} } } }`);
    return (d.invoices?.nodes || []).map((i) => ({
      id: i.id, invoiceNumber: i.invoiceNumber, client: i.client?.name || '', phone: phoneOf(i.client),
      balance: i.amounts?.invoiceBalance ?? i.amounts?.total ?? null, dueDate: i.dueDate, url: i.jobberWebUri,
    })).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, errors);

  const workflow = await section('workflow', async () => {
    const c = await jobberQuery(`{
      rNew: requests(first: 1, filter: { status: new }) { totalCount }
      rOverdue: requests(first: 1, filter: { status: overdue }) { totalCount }
      qApproved: quotes(first: 1, filter: { status: approved }) { totalCount }
      qDraft: quotes(first: 1, filter: { status: draft }) { totalCount }
      qChanges: quotes(first: 1, filter: { status: changes_requested }) { totalCount }
      jInvoice: jobs(first: 1, filter: { status: requires_invoicing }) { totalCount }
      iDraft: invoices(first: 1, filter: { status: draft }) { totalCount }
    }`);
    const m = await jobberQuery(`{
      jActive: jobs(first: 100, filter: { status: active }) { totalCount nodes { total } }
      jAction: jobs(first: 50, filter: { status: action_required }) { totalCount nodes { total } }
      iAwaiting: invoices(first: 100, filter: { status: awaiting_payment }) { totalCount nodes { amounts { invoiceBalance } } }
      iPast: invoices(first: 50, filter: { status: past_due }) { totalCount nodes { amounts { invoiceBalance } } }
    }`);
    const sum = (conn, f) => (conn?.nodes || []).reduce((s, n) => s + (Number(f(n)) || 0), 0);
    return {
      requests: { new: c.rNew?.totalCount ?? 0, overdue: c.rOverdue?.totalCount ?? 0 },
      quotes: { approved: c.qApproved?.totalCount ?? 0, draft: c.qDraft?.totalCount ?? 0, changes: c.qChanges?.totalCount ?? 0 },
      jobs: {
        requiresInvoicing: c.jInvoice?.totalCount ?? 0,
        active: m.jActive?.totalCount ?? 0, activeTotal: sum(m.jActive, (n) => n.total),
        actionRequired: m.jAction?.totalCount ?? 0, actionTotal: sum(m.jAction, (n) => n.total),
      },
      invoices: {
        awaiting: m.iAwaiting?.totalCount ?? 0, awaitingTotal: sum(m.iAwaiting, (n) => n.amounts?.invoiceBalance),
        draft: c.iDraft?.totalCount ?? 0,
        pastDue: m.iPast?.totalCount ?? 0, pastDueTotal: sum(m.iPast, (n) => n.amounts?.invoiceBalance),
      },
    };
  }, errors);

  // Attach labor to each crew row: cost, and labor % of what they brought in.
  if (money && labor) for (const c of money.byCrew) {
    const L = labor.find((l) => l.name === c.name) || labor.find((l) => l.name.split(' ')[0] === c.name.split(' ')[0]);
    if (!L) continue;
    c.hours = L.hours; c.rate = L.rate; c.laborCost = L.cost; c.clockedIn = L.ticking;
    c.laborPct = L.cost != null && c.completed > 0 && !c.pending.length ? Math.round((L.cost / c.completed) * 1000) / 10 : null;
  }

  return { workflow, today, duplicates: duplicates.map((x) => ({ id: x.id, client: x.client || x.title, crew: x.crew, url: x.url, jobNumber: x.jobNumber })), money, payments, requests, toInvoice, overdue: { items: lateItems, invoices: pastDue }, errors, at: new Date().toISOString() };
}

export default async function handler(req, res) {
  const db = getSupabaseAdmin();
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const { data: who } = token ? await db.auth.getUser(token) : { data: null };
  const role = who?.user?.user_metadata?.role;
  // ?crew=1 → the crew's Start of Day "Review jobs": today's stops only (no money, no phones).
  if (req.query?.crew) {
    if (!who?.user || role === 'applicant') return res.status(401).json({ error: 'Log in to the Hub first.' });
    try {
      // Use the owner's fresh full build if there is one; else a quick stops-only build (own cache).
      let today = cache.data && Date.now() - cache.at < TTL ? cache.data.today : null;
      if (!today) {
        if (!crewCache.data || Date.now() - crewCache.at > TTL) {
          const d = await build({ onlyToday: true });
          if (!d.today) throw new Error(d.errors.today || 'Couldn’t load jobs');
          crewCache = { at: Date.now(), data: d.today };
        }
        today = crewCache.data;
      }
      const stops = (today || []).filter((x) => x.type === 'Visit' || x.type === 'Assessment')
        .map((x) => ({ id: x.id, client: x.client || x.title, title: x.title, address: x.address, lat: x.lat, lng: x.lng, crew: x.crew, allDay: x.allDay, startAt: x.startAt, done: x.done }));
      return res.json({ stops });
    } catch (err) { return res.status(502).json({ error: err.message }); }
  }
  if (role !== 'owner') return res.status(401).json({ error: 'Log in to the Hub as the owner first.' });

  if (!req.query?.fresh && cache.data && Date.now() - cache.at < TTL) return res.json({ ...cache.data, cached: true });
  try {
    const data = await build();
    const allFailed = ['workflow', 'today', 'requests', 'invoice', 'overdue', 'pastDue'].every((k) => data.errors[k]);
    if (allFailed) {
      const msg = Object.values(data.errors)[0];
      if (cache.data) return res.json({ ...cache.data, cached: true, stale: true, error: msg });
      return res.status(502).json({ error: msg });
    }
    cache = { at: Date.now(), data };
    return res.json(data);
  } catch (err) {
    console.error('[jobber-today]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

export { build as buildJobberToday };
