import { jobberQuery, jobberStatus, forceRefresh, JobberDisconnectedError } from '../lib/jobberClient.js';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

// ── Pay Rate Overrides (actual pay, not Jobber billing rate) ──
const PAY_RATE_OVERRIDES = {
  'Jude': 16,
};
function getPayRate(name, jobberRate) {
  return PAY_RATE_OVERRIDES[name] ?? jobberRate;
}

// ── Client Search ──

const SEARCH_CLIENTS_QUERY = `
  query SearchClients($searchTerm: String!) {
    clients(first: 10, searchTerm: $searchTerm) {
      nodes {
        id firstName lastName companyName
        phones { number }
        emails { address }
        billingAddress { street1 street2 city province postalCode }
      }
    }
  }
`;

function formatAddress(addr) {
  if (!addr) return { address: null, city: null, state: null, zip: null };
  return {
    address: [addr.street1, addr.street2].filter(Boolean).join(', ') || null,
    city: addr.city || null, state: addr.province || null, zip: addr.postalCode || null,
  };
}

async function handleClientSearch(req, res) {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q query parameter is required' });

  const data = await jobberQuery(SEARCH_CLIENTS_QUERY, { searchTerm: q });
  const results = (data.clients?.nodes || []).map(client => {
    const name = [client.firstName, client.lastName].filter(Boolean).join(' ') || client.companyName || 'Unknown';
    const { address, city, state, zip } = formatAddress(client.billingAddress);
    return {
      id: client.id, name,
      phone: client.phones?.[0]?.number || null,
      email: client.emails?.[0]?.address || null,
      address, city, state, zip,
    };
  });
  return res.json(results);
}

// ── All Clients (cached) ──

let allClientsCache = null;
let allClientsCacheTime = 0;
const ALL_CLIENTS_TTL = 10 * 60 * 1000; // 10 min

async function handleAllClients(req, res) {
  if (allClientsCache && Date.now() - allClientsCacheTime < ALL_CLIENTS_TTL) {
    return res.json(allClientsCache);
  }

  const all = [];
  let cursor = null, hasNext = true;
  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await jobberQuery(`{ clients(first: 100${after}) { nodes { id firstName lastName companyName phones { number } emails { address } billingAddress { street1 street2 city province postalCode } tags { nodes { label } } isLead createdAt updatedAt } pageInfo { hasNextPage endCursor } } }`);
    all.push(...(data.clients?.nodes || []));
    hasNext = data.clients?.pageInfo?.hasNextPage || false;
    cursor = data.clients?.pageInfo?.endCursor || null;
    if (all.length > 1000) break;
    if (hasNext) await new Promise((r) => setTimeout(r, 600)); // throttle guard
  }

  const results = all.map(c => {
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.companyName || 'Unknown';
    const { address, city, state, zip } = formatAddress(c.billingAddress);
    return {
      id: c.id, name,
      phone: c.phones?.[0]?.number || null,
      email: c.emails?.[0]?.address || null,
      address, city, state, zip,
      isLead: c.isLead,
      tags: (c.tags?.nodes || []).map(t => t.label),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  });

  allClientsCache = results;
  allClientsCacheTime = Date.now();
  return res.json(results);
}

// ── Labor Data (visits + timesheets) ──

async function fetchVisits(start, end) {
  const startISO = new Date(start + 'T00:00:00').toISOString();
  const endPlusOne = new Date(end + 'T00:00:00');
  endPlusOne.setDate(endPlusOne.getDate() + 1);
  const endISO = endPlusOne.toISOString();

  // Lean visit query — line items are fetched per-job below (deduped + cached).
  const allVisits = [];
  let cursor = null, hasNext = true;
  let page = 0;
  while (hasNext) {
    if (page++ > 0) await new Promise(r => setTimeout(r, 1500));
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await jobberQuery(`{ visits(first: 25${after}, filter: { completedAt: { after: "${startISO}", before: "${endISO}" } }) { nodes { id title completedAt startAt endAt job { id jobNumber jobType jobStatus total billingType invoiceSchedule { billingFrequency scheduleSummary } visitSchedule { recurrenceSchedule { friendly } } client { firstName lastName } } } pageInfo { hasNextPage endCursor } } }`);
    allVisits.push(...(data.visits?.nodes || []));
    hasNext = data.visits?.pageInfo?.hasNextPage || false;
    cursor = data.visits?.pageInfo?.endCursor || null;
    if (allVisits.length > 500) break;
  }
  return allVisits.filter(v => { const d = (v.completedAt || v.startAt || '').split('T')[0]; return d >= start && d <= end; });
}

// How a job is billed, for the payroll page: fixed-price recurring jobs bill a set amount per
// invoice period (e.g. monthly) no matter how many visits, so their per-visit value is less than the total.
function billingOf(job) {
  if (!job) return null;
  return {
    type: job.billingType || null,                                  // FIXED_PRICE | VISIT_BASED
    frequency: job.invoiceSchedule?.billingFrequency || null,       // PERIODIC | PER_VISIT | ON_COMPLETION | NEVER
    invoices: job.invoiceSchedule?.scheduleSummary || null,         // "Monthly on the 1st day of the month"
    visits: job.visitSchedule?.recurrenceSchedule?.friendly || null, // "Every 2 weeks on Mondays"
  };
}

async function fetchTimesheets(start, end) {
  const startISO = new Date(start + 'T00:00:00').toISOString();
  const endPlusOne = new Date(end + 'T00:00:00');
  endPlusOne.setDate(endPlusOne.getDate() + 1);
  const endISO = endPlusOne.toISOString();

  const all = [];
  let cursor = null, hasNext = true;
  let page = 0;
  while (hasNext) {
    if (page++ > 0) await new Promise(r => setTimeout(r, 1500));
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await jobberQuery(`{ timeSheetEntries(first: 100${after}, filter: { startAt: { after: "${startISO}", before: "${endISO}" } }) { nodes { id startAt endAt duration labourRate label user { id name { full } } job { id } } pageInfo { hasNextPage endCursor } } }`);
    all.push(...(data.timeSheetEntries?.nodes || []));
    hasNext = data.timeSheetEntries?.pageInfo?.hasNextPage || false;
    cursor = data.timeSheetEntries?.pageInfo?.endCursor || null;
    // Cap at 5000 — 1000 was too low for 90-day windows (1400+ entries common in season).
    if (all.length > 5000) break;
  }
  return all;
}

async function fetchExpenses(start, end) {
  const startISO = new Date(start + 'T00:00:00').toISOString();
  const endPlusOne = new Date(end + 'T00:00:00');
  endPlusOne.setDate(endPlusOne.getDate() + 1);
  const endISO = endPlusOne.toISOString();

  const all = [];
  let cursor = null, hasNext = true;
  let page = 0;
  while (hasNext) {
    if (page++ > 0) await new Promise(r => setTimeout(r, 1500));
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await jobberQuery(`{ expenses(first: 25${after}, filter: { date: { after: "${startISO}", before: "${endISO}" } }) { nodes { id title total date description linkedJob { id jobNumber } paidBy { name { full } } } pageInfo { hasNextPage endCursor } } }`);
    all.push(...(data.expenses?.nodes || []));
    hasNext = data.expenses?.pageInfo?.hasNextPage || false;
    cursor = data.expenses?.pageInfo?.endCursor || null;
    if (all.length > 500) break;
  }
  return all;
}

// Fetch ALL completed visits for a specific job (across all time)
async function fetchVisitsForJob(jobId) {
  const allVisits = [];
  let cursor = null, hasNext = true;
  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await jobberQuery(`{ job(id: "${jobId}") { visits(first: 100${after}) { nodes { id completedAt startAt endAt } pageInfo { hasNextPage endCursor } } } }`);
    allVisits.push(...(data.job?.visits?.nodes || []));
    hasNext = data.job?.visits?.pageInfo?.hasNextPage || false;
    cursor = data.job?.visits?.pageInfo?.endCursor || null;
    if (allVisits.length > 200) break;
  }
  // Only count visits that have been completed
  return allVisits.filter(v => v.completedAt);
}

// Labor data cache — in-memory + persisted to Supabase so cold starts
// don't always hammer Jobber (which rate-limits the 90-day scan).
const laborCache = {};
const LABOR_CACHE_TTL = 30 * 60 * 1000;          // serve fresh up to 30 min
const LABOR_STALE_OK_TTL = 24 * 60 * 60 * 1000;  // willing to serve stale up to 24h on throttle

async function loadPersistedLabor(cacheKey) {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('app_state').select('value')
      .eq('key', `labor-cache:${cacheKey}`).maybeSingle();
    if (data?.value?.data && data.value.time) {
      laborCache[cacheKey] = { data: data.value.data, time: data.value.time };
      return laborCache[cacheKey];
    }
  } catch (err) {
    console.warn('[Labor] Persist load failed:', err.message);
  }
  return null;
}

async function persistLabor(cacheKey, entry) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('app_state').upsert({
      key: `labor-cache:${cacheKey}`,
      value: { data: entry.data, time: entry.time },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
  } catch (err) {
    console.warn('[Labor] Persist save failed:', err.message);
  }
}

// Per-VISIT line items cache — the actual price for that specific visit,
// including any per-visit overrides/discounts. Cached briefly so the
// page is responsive but stays accurate.
const visitLineItemsCache = new Map(); // visitId -> { total, time }
const VISIT_LINEITEMS_TTL = 30 * 60 * 1000;
// Per-job expenses cache — catches expenses linked to a job whose
// own `date` field falls outside the queried window.
const jobExpensesCache = new Map(); // jobId -> { items, time }
const JOB_EXPENSES_TTL = 10 * 60 * 1000;
async function fetchJobExpenses(jobId) {
  const cached = jobExpensesCache.get(jobId);
  if (cached && Date.now() - cached.time < JOB_EXPENSES_TTL) return cached.items;
  try {
    const data = await jobberQuery(`{ job(id: "${jobId}") { expenses { nodes { id title total date description paidBy { name { full } } } } } }`);
    const items = data.job?.expenses?.nodes || [];
    jobExpensesCache.set(jobId, { items, time: Date.now() });
    return items;
  } catch (err) {
    if (cached) return cached.items;
    return [];
  }
}

// Batched fetchJobExpenses: fills jobExpensesCache for each job. On error, jobs keep
// whatever was cached (or none), same as the single-job version.
const JOB_EXPENSES_BATCH = 10; // ~400 requested cost each with first: 50; Jobber caps a query at 10,000
async function fetchJobExpensesBatch(jobIds) {
  try {
    const body = jobIds.map((id, i) => `j${i}: job(id: "${id}") { expenses(first: 50) { nodes { id title total date description paidBy { name { full } } } } }`).join(' ');
    const data = await jobberQuery(`{ ${body} }`);
    jobIds.forEach((id, i) => jobExpensesCache.set(id, { items: data[`j${i}`]?.expenses?.nodes || [], time: Date.now() }));
  } catch (err) {
    console.error('[Labor] Batched job expenses failed:', err.message);
  }
}

// Batched version: `{ v0: visit(id:…) { … } v1: … }`. Returns visitId -> total (null = no
// per-visit line items). On error, falls back to whatever is cached for each visit.
const VISIT_LINEITEMS_BATCH = 15;
async function fetchVisitLineItemsTotals(visitIds) {
  const out = {};
  try {
    const body = visitIds.map((id, i) => `v${i}: visit(id: "${id}") { lineItems { nodes { totalPrice } } }`).join(' ');
    const data = await jobberQuery(`{ ${body} }`);
    visitIds.forEach((id, i) => {
      const nodes = data[`v${i}`]?.lineItems?.nodes || [];
      const total = nodes.length ? nodes.reduce((s, li) => s + (parseFloat(li.totalPrice) || 0), 0) : null;
      if (total !== null) visitLineItemsCache.set(id, { total, time: Date.now() });
      out[id] = total;
    });
  } catch (err) {
    console.error('[Labor] Batched line items failed:', err.message);
    for (const id of visitIds) out[id] = visitLineItemsCache.get(id)?.total ?? null;
  }
  return out;
}

async function fetchVisitLineItemsTotal(visitId) {
  const cached = visitLineItemsCache.get(visitId);
  if (cached && Date.now() - cached.time < VISIT_LINEITEMS_TTL) return cached.total;
  try {
    const data = await jobberQuery(`{ visit(id: "${visitId}") { lineItems { nodes { totalPrice } } } }`);
    const nodes = data.visit?.lineItems?.nodes || [];
    if (nodes.length === 0) return null; // no per-visit line items
    const total = nodes.reduce((s, li) => s + (parseFloat(li.totalPrice) || 0), 0);
    visitLineItemsCache.set(visitId, { total, time: Date.now() });
    return total;
  } catch (err) {
    if (cached) return cached.total;
    return null;
  }
}

// Thin HTTP wrapper. Real work in loadLaborGrouped() so cron + recurring-summary
// can call into it directly without going through HTTP.
async function handleLaborData(req, res) {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end required' });
  try {
    const data = await loadLaborGrouped({
      start, end,
      skipLineItems: req.query.skipLineItems === '1',
      skipJobExpenses: req.query.skipJobExpenses === '1',
      forceRefresh: req.query.refresh === '1',
    });
    return res.json(data);
  } catch (err) {
    if (err.code === 'THROTTLED') return res.status(429).json({ error: err.message, code: 'THROTTLED' });
    if (err.code === 'JOBBER_DISCONNECTED') return res.status(401).json({ error: err.message, code: 'JOBBER_DISCONNECTED' });
    return res.status(500).json({ error: err.message });
  }
}

async function loadLaborGrouped({ start, end, skipLineItems = true, skipJobExpenses = true, forceRefresh = false } = {}) {
  const cacheKey = `v6|${start}|${end}|${skipLineItems ? 'nopv' : 'full'}|${skipJobExpenses ? 'noje' : 'je'}`; // v2: one-off jobs split by hours; v3: billing type + schedules
  let cached = laborCache[cacheKey];
  if (!cached) cached = await loadPersistedLabor(cacheKey);
  if (cached && !forceRefresh && Date.now() - cached.time < LABOR_CACHE_TTL) {
    return cached.data;
  }

  let visits, timesheets, expenses;
  try {
    visits = await fetchVisits(start, end);
    await new Promise(r => setTimeout(r, 500));
    timesheets = await fetchTimesheets(start, end);
    await new Promise(r => setTimeout(r, 500));
    expenses = await fetchExpenses(start, end);
  } catch (err) {
    console.error('[Labor] Fetch error:', err.message);
    // Serve stale (up to 24h) if we have it — beats showing "rate limited" forever.
    if (cached && Date.now() - cached.time < LABOR_STALE_OK_TTL) {
      console.log(`[Labor] Serving stale cache (age ${Math.round((Date.now() - cached.time) / 60000)}m)`);
      return cached.data;
    }
    if (err.message?.includes('Throttled')) {
      throw Object.assign(new Error('Jobber needs a moment — tap refresh.'), { code: 'THROTTLED' });
    }
    if (err.code === 'JOBBER_DISCONNECTED') throw err;
    throw err;
  }

  const grouped = {};
  const cur = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  while (cur <= endDate) { const ds = cur.toISOString().split('T')[0]; grouped[ds] = { visits: [], revenue: 0, expenses: { total: 0, items: [] }, labor: { totalHours: 0, totalCost: 0, byPerson: {} } }; cur.setDate(cur.getDate() + 1); }

  // ── Per-visit line item totals (the actual price for THAT visit) ──
  // Throttled separate fetch to avoid Jobber rate limiting.
  // Skipped when caller only needs job-level totals (saves N API calls).
  const visitLineItemTotals = {};
  if (!skipLineItems) {
    // One aliased query per batch of visits instead of one call each: a busy week has 30+
    // visits, and one-by-one ran past Vercel's 30s limit.
    const ids = visits.map((v) => v.id).filter(Boolean);
    const todo = [];
    for (const id of ids) {
      const c = visitLineItemsCache.get(id);
      if (c && Date.now() - c.time < VISIT_LINEITEMS_TTL) visitLineItemTotals[id] = c.total;
      else todo.push(id);
    }
    for (let i = 0; i < todo.length; i += VISIT_LINEITEMS_BATCH) {
      if (i > 0) await new Promise((r) => setTimeout(r, 350));
      Object.assign(visitLineItemTotals, await fetchVisitLineItemsTotals(todo.slice(i, i + VISIT_LINEITEMS_BATCH)));
    }
  }

  // ── Per-job expenses (catches expenses whose own date falls outside the window) ──
  // Skip when the caller just needs job-level totals — this loop makes 1 API call per unique
  // job, which is what most often hits Jobber's rate limit.
  if (!skipJobExpenses) {
    const uniqueJobIdsForExpenses = [...new Set(visits.map(v => v.job?.id).filter(Boolean))];
    const seenExpenseIds = new Set(expenses.map(e => e.id));
    // Same batching as line items: one call per job ran past Vercel's 30s limit.
    const todoJobs = uniqueJobIdsForExpenses.filter((id) => { const c = jobExpensesCache.get(id); return !(c && Date.now() - c.time < JOB_EXPENSES_TTL); });
    for (let i = 0; i < todoJobs.length; i += JOB_EXPENSES_BATCH) {
      if (i > 0) await new Promise((r) => setTimeout(r, 250));
      await fetchJobExpensesBatch(todoJobs.slice(i, i + JOB_EXPENSES_BATCH));
    }
    for (const jobId of uniqueJobIdsForExpenses) {
      const jobExps = jobExpensesCache.get(jobId)?.items || [];
      for (const e of jobExps) {
        if (seenExpenseIds.has(e.id)) continue;
        const expDate = (e.date || '').split('T')[0];
        let anchorDate = expDate && grouped[expDate] ? expDate : null;
        if (!anchorDate) {
          const visitDates = visits.filter(v => v.job?.id === jobId).map(v => (v.completedAt || v.startAt || '').split('T')[0]).filter(Boolean).sort();
          anchorDate = visitDates.find(d => grouped[d]) || null;
        }
        if (!anchorDate) continue;
        expenses.push({ ...e, date: anchorDate + 'T12:00:00', linkedJob: { id: jobId, jobNumber: visits.find(v => v.job?.id === jobId)?.job?.jobNumber || null } });
        seenExpenseIds.add(e.id);
      }
    }
  }

  // ── Collect all visits ──
  const allVisitRefs = []; // { dateStr, visitObj, jobId, rawTotal }
  for (const visit of visits) {
    const dateStr = (visit.completedAt || visit.startAt || '').split('T')[0];
    if (!dateStr || !grouped[dateStr]) continue;
    // Prefer the visit's own line items (today's actual price). Fall back to job.total.
    const visitLineTotal = visitLineItemTotals[visit.id];
    const rawTotal = (visitLineTotal !== null && visitLineTotal !== undefined)
      ? visitLineTotal
      : (parseFloat(visit.job?.total) || 0);
    const jobId = visit.job?.id || null;
    // Compute visit duration from start/end for proportional hour allocation
    let visitDuration = 0;
    if (visit.startAt && visit.endAt) {
      visitDuration = (new Date(visit.endAt) - new Date(visit.startAt)) / 3600000;
      if (visitDuration < 0) visitDuration = 0;
    }
    const visitObj = { id: visit.id, title: visit.title, completedAt: visit.completedAt, startAt: visit.startAt, endAt: visit.endAt, visitDuration, jobId, jobNumber: visit.job?.jobNumber, jobType: visit.job?.jobType || null, jobStatus: visit.job?.jobStatus || null, billing: billingOf(visit.job), jobTotal: rawTotal, visitTotal: rawTotal, client: visit.job?.client ? `${visit.job.client.firstName || ''} ${visit.job.client.lastName || ''}`.trim() : 'Unknown', labor: { totalHours: 0, totalCost: 0, byPerson: {} } };
    grouped[dateStr].visits.push(visitObj);
    allVisitRefs.push({ dateStr, visitObj, jobId, rawTotal });
  }

  // ── Day-level labor totals (for the scorecard) ──
  // Also track actual daily hours per jobId for expense calculation
  const actualDailyJobHours = {}; // `${dateStr}|${jobId}` -> hours
  for (const entry of timesheets) {
    const dateStr = (entry.startAt || '').split('T')[0];
    if (!dateStr || !grouped[dateStr]) continue;
    const hours = (entry.duration || 0) / 3600;
    const name = entry.user?.name?.full || 'Unknown';
    const rate = getPayRate(name, entry.labourRate || 0);
    const cost = hours * rate;
    const hasJob = !!entry.job?.id;
    const label = entry.label || '';
    const isUnknownJob = !hasJob && label.toLowerCase().includes('unknown');
    const timeType = (hasJob || isUnknownJob) ? 'job' : 'general';

    grouped[dateStr].labor.totalHours += hours;
    grouped[dateStr].labor.totalCost += cost;
    if (timeType === 'job') { grouped[dateStr].labor.jobHours = (grouped[dateStr].labor.jobHours || 0) + hours; grouped[dateStr].labor.jobCost = (grouped[dateStr].labor.jobCost || 0) + cost; }
    else { grouped[dateStr].labor.generalHours = (grouped[dateStr].labor.generalHours || 0) + hours; grouped[dateStr].labor.generalCost = (grouped[dateStr].labor.generalCost || 0) + cost;
      // Each general clock entry (drive, load, gas between jobs) — the payroll page shows them between the jobs.
      (grouped[dateStr].labor.generalEntries ||= []).push({ name, startAt: entry.startAt, endAt: entry.endAt || null, hours: Math.round(hours * 100) / 100, label }); }
    if (!grouped[dateStr].labor.byPerson[name]) grouped[dateStr].labor.byPerson[name] = { hours: 0, rate, cost: 0, jobHours: 0, jobCost: 0, generalHours: 0, generalCost: 0 };
    grouped[dateStr].labor.byPerson[name].hours += hours;
    grouped[dateStr].labor.byPerson[name].cost += cost;
    if (timeType === 'job') { grouped[dateStr].labor.byPerson[name].jobHours += hours; grouped[dateStr].labor.byPerson[name].jobCost += cost; }
    else { grouped[dateStr].labor.byPerson[name].generalHours += hours; grouped[dateStr].labor.byPerson[name].generalCost += cost; }
    if (rate > 0) grouped[dateStr].labor.byPerson[name].rate = rate;

    // Track actual daily hours per job
    if (hasJob) {
      const key = `${dateStr}|${entry.job.id}`;
      actualDailyJobHours[key] = (actualDailyJobHours[key] || 0) + hours;
    }
  }

  // ── In-range expenses (day-level totals) ──
  for (const exp of expenses) {
    const dateStr = (exp.date || '').split('T')[0];
    if (!dateStr || !grouped[dateStr]) continue;
    const amount = parseFloat(exp.total) || 0;
    grouped[dateStr].expenses.total += amount;
    grouped[dateStr].expenses.items.push({
      id: exp.id, title: exp.title, amount, description: exp.description || '',
      jobId: exp.linkedJob?.id || null, jobNumber: exp.linkedJob?.jobNumber || null,
      paidBy: exp.paidBy?.name?.full || null,
    });
  }

  // ── Group visits by jobId ──
  const visitsByJob = {};
  for (const ref of allVisitRefs) {
    if (!ref.jobId) continue;
    if (!visitsByJob[ref.jobId]) visitsByJob[ref.jobId] = [];
    visitsByJob[ref.jobId].push(ref);
  }

  // ── Find jobs that have timesheets in range but NO visits ──
  const timesheetJobIds = new Set();
  for (const entry of timesheets) {
    if (entry.job?.id) timesheetJobIds.add(entry.job.id);
  }
  // Add timesheet-only jobs to visitsByJob so they get processed
  for (const jobId of timesheetJobIds) {
    if (!visitsByJob[jobId]) {
      visitsByJob[jobId] = []; // empty — no visits, but has timesheets
    }
  }

  // ── Step 1: For jobs with visits in range, use existing data. Only fetch from Jobber for timesheet-only jobs. ──
  const jobVisitData = {};

  // Jobs that already have visits — use what we have, assume single-visit unless we detect otherwise
  for (const [jobId, refs] of Object.entries(visitsByJob)) {
    if (refs.length > 0) {
      jobVisitData[jobId] = {
        visitCount: refs.length,
        allVisitDates: refs.map(r => r.dateStr),
        jobTotal: refs[0].rawTotal,
        clientName: refs[0].visitObj.client,
        title: refs[0].visitObj.title,
        jobNumber: refs[0].visitObj.jobNumber,
      };
    }
  }

  // Jobs from timesheets only (no visits in range) — use placeholder instead of fetching
  const timesheetOnlyJobIds = Object.keys(visitsByJob).filter(id => visitsByJob[id].length === 0);
  for (const jobId of timesheetOnlyJobIds) {
    jobVisitData[jobId] = { visitCount: 1, allVisitDates: [], jobTotal: 0, clientName: 'Unknown', title: 'Timesheet-only', jobNumber: null };
  }

  // ── Step 2: For multi-visit jobs, find the widest date range needed ──
  let wideStart = start, wideEnd = end;
  for (const [jobId, info] of Object.entries(jobVisitData)) {
    const dates = info.allVisitDates;
    if (dates.length > 0) {
      if (dates[0] < wideStart) wideStart = dates[0];
      if (dates[dates.length - 1] > wideEnd) wideEnd = dates[dates.length - 1];
    }
  }

  // Use existing timesheets/expenses — no additional fetches
  let fullTimesheets = timesheets;
  let fullExpenses = expenses;

  // Index full timesheets and expenses by jobId
  const fullTsByJob = {};
  for (const t of fullTimesheets) {
    if (t.job?.id) {
      if (!fullTsByJob[t.job.id]) fullTsByJob[t.job.id] = [];
      fullTsByJob[t.job.id].push(t);
    }
  }
  const fullExpByJob = {};
  for (const e of fullExpenses) {
    const jid = e.linkedJob?.id;
    if (jid) {
      if (!fullExpByJob[jid]) fullExpByJob[jid] = [];
      fullExpByJob[jid].push(e);
    }
  }

  // ── Step 4: Distribute labor, revenue, and expenses to each day with work ──
  // For multi-visit jobs: create an entry for EVERY day that has timesheets,
  // not just days with a Jobber "visit". Revenue/expenses are proportional to hours.

  // Remove ALL Jobber visit placeholders — we recreate from timesheets per-day
  for (const date of Object.keys(grouped)) {
    grouped[date].visits = grouped[date].visits.filter(v => !v.jobId);
  }

  for (const [jobId, refs] of Object.entries(visitsByJob)) {
    const info = jobVisitData[jobId] || { visitCount: refs.length, allVisitDates: [], jobTotal: 0, clientName: 'Unknown', title: '', jobNumber: null };
    const jobTotal = refs.length > 0 ? refs[0].rawTotal : info.jobTotal;
    const clientName = refs.length > 0 ? refs[0].visitObj.client : info.clientName;
    const jobNumber = refs.length > 0 ? refs[0].visitObj.jobNumber : info.jobNumber;
    const title = refs.length > 0 ? refs[0].visitObj.title : info.title;
    const jobType = refs.length > 0 ? refs[0].visitObj.jobType : null;
    const jobStatus = refs.length > 0 ? refs[0].visitObj.jobStatus : null;
    const billing = refs.length > 0 ? refs[0].visitObj.billing : null;

    // Get all timesheets and expenses for this job
    const jobTs = fullTsByJob[jobId] || [];
    const jobExp = fullExpByJob[jobId] || [];
    const totalJobExpenses = jobExp.reduce((s, e) => s + (parseFloat(e.total) || 0), 0);

    // Group timesheets by date
    const hoursByDate = {};
    const costByDate = {};
    const personByDate = {};
    const earliestStartByDate = {};
    for (const t of jobTs) {
      const startRaw = t.startAt || '';
      const d = startRaw.split('T')[0];
      if (!d) continue;
      const hrs = (t.duration || 0) / 3600;
      const name = t.user?.name?.full || 'Unknown';
      const rate = getPayRate(name, t.labourRate || 0);
      const cost = hrs * rate;
      hoursByDate[d] = (hoursByDate[d] || 0) + hrs;
      costByDate[d] = (costByDate[d] || 0) + cost;
      if (!personByDate[d]) personByDate[d] = {};
      if (!personByDate[d][name]) personByDate[d][name] = { hours: 0, rate, cost: 0 };
      personByDate[d][name].hours += hrs;
      personByDate[d][name].cost += cost;
      if (rate > 0) personByDate[d][name].rate = rate;
      // Each person's clock-in/out on this job (the payroll page shows who was there when).
      const pp = personByDate[d][name];
      if (startRaw && (!pp.firstAt || startRaw < pp.firstAt)) pp.firstAt = startRaw;
      if (t.endAt && (!pp.lastAt || t.endAt > pp.lastAt)) pp.lastAt = t.endAt;
      if (!earliestStartByDate[d] || startRaw < earliestStartByDate[d]) earliestStartByDate[d] = startRaw;
    }

    const totalJobHours = Object.values(hoursByDate).reduce((s, h) => s + h, 0);

    // Create a visit entry for each in-range date that has hours.
    // Recurring jobs: every work day is its own visit at the full price.
    // One-off jobs: the price is split across the days by hours worked.
    // Trust Jobber's jobType; only guess (multiple days = recurring) when it's missing.
    const workDays = Object.keys(hoursByDate).length;
    const isRecurring = jobType ? jobType === 'RECURRING' : workDays > 1;

    for (const [dateStr, dayHours] of Object.entries(hoursByDate)) {
      if (!grouped[dateStr]) continue;
      const proportion = totalJobHours > 0 ? dayHours / totalJobHours : 0;
      const visitRevenue = isRecurring ? jobTotal : jobTotal * proportion;
      const visitExpenses = isRecurring ? totalJobExpenses / workDays : totalJobExpenses * proportion;

      grouped[dateStr].visits.push({
        id: `${jobId}-${dateStr}`,
        title,
        completedAt: dateStr,
        startAt: earliestStartByDate[dateStr] || null,
        jobId,
        jobNumber,
        jobType,
        jobStatus,
        billing,
        client: clientName,
        jobTotal: visitRevenue,
        rawJobTotal: jobTotal,
        totalJobHours,
        totalJobExpenses,
        actualDailyHours: dayHours,
        jobExpenses: visitExpenses,
        labor: {
          totalHours: dayHours,
          totalCost: costByDate[dateStr] || 0,
          byPerson: personByDate[dateStr] || {},
        },
      });
      grouped[dateStr].revenue += visitRevenue;
    }
  }

  // Add revenue for visits without a jobId
  for (const ref of allVisitRefs) {
    if (!ref.jobId) grouped[ref.dateStr].revenue += ref.rawTotal;
  }

  // Attach actual daily hours to each visit for expense calculation
  for (const ref of allVisitRefs) {
    if (ref.jobId) {
      const key = `${ref.dateStr}|${ref.jobId}`;
      ref.visitObj.actualDailyHours = actualDailyJobHours[key] || 0;
    }
  }

  const r2 = v => Math.round(v * 100) / 100;
  for (const date of Object.keys(grouped)) {
    grouped[date].revenue = r2(grouped[date].revenue);
    grouped[date].expenses.total = r2(grouped[date].expenses.total);
    grouped[date].labor.totalHours = r2(grouped[date].labor.totalHours);
    grouped[date].labor.totalCost = r2(grouped[date].labor.totalCost);
    grouped[date].labor.jobHours = r2(grouped[date].labor.jobHours || 0);
    grouped[date].labor.jobCost = r2(grouped[date].labor.jobCost || 0);
    grouped[date].labor.generalHours = r2(grouped[date].labor.generalHours || 0);
    grouped[date].labor.generalCost = r2(grouped[date].labor.generalCost || 0);
    for (const n of Object.keys(grouped[date].labor.byPerson)) {
      const p = grouped[date].labor.byPerson[n];
      p.hours = r2(p.hours); p.cost = r2(p.cost);
      p.jobHours = r2(p.jobHours || 0); p.jobCost = r2(p.jobCost || 0);
      p.generalHours = r2(p.generalHours || 0); p.generalCost = r2(p.generalCost || 0);
    }
    for (const v of grouped[date].visits) {
      v.labor.totalHours = r2(v.labor.totalHours);
      v.labor.totalCost = r2(v.labor.totalCost);
      for (const n of Object.keys(v.labor.byPerson)) {
        const p = v.labor.byPerson[n];
        p.hours = r2(p.hours); p.cost = r2(p.cost);
      }
    }
  }
  laborCache[cacheKey] = { data: grouped, time: Date.now() };
  persistLabor(cacheKey, laborCache[cacheKey]).catch(() => {}); // fire-and-forget
  return grouped;
}

// Aggregate the per-day grouped labor data into per-jobId totals + Labor %,
// plus a per-visit breakdown for the drill-down view.
// Used by the cron + recurring-summary endpoint.
function buildLaborAggregates(grouped) {
  const byJob = {};
  const r2 = (n) => Math.round((n || 0) * 100) / 100;
  for (const [date, day] of Object.entries(grouped || {})) {
    for (const v of (day.visits || [])) {
      if (!v.jobId) continue;
      if (!byJob[v.jobId]) byJob[v.jobId] = { rev: 0, labor: 0, hours: 0, visits: [] };
      const visitRev = (v.rawJobTotal ?? v.jobTotal) || 0;
      const visitLabor = v.labor?.totalCost || 0;
      const visitHours = v.labor?.totalHours || 0;
      byJob[v.jobId].rev += visitRev;
      byJob[v.jobId].labor += visitLabor;
      byJob[v.jobId].hours += visitHours;
      byJob[v.jobId].visits.push({
        date,
        rev: r2(visitRev),
        labor: r2(visitLabor),
        hours: r2(visitHours),
        laborPct: visitRev > 0 ? Math.round((visitLabor / visitRev) * 100) / 1 : null,
        byPerson: Object.entries(v.labor?.byPerson || {})
          .map(([name, p]) => ({ name, hours: r2(p.hours), cost: r2(p.cost) }))
          .sort((a, b) => b.hours - a.hours),
      });
    }
  }
  for (const id in byJob) {
    const m = byJob[id];
    m.laborPct = m.rev > 0 ? (m.labor / m.rev) * 100 : null;
    m.rev = r2(m.rev);
    m.labor = r2(m.labor);
    m.hours = r2(m.hours);
    m.visits.sort((a, b) => b.date.localeCompare(a.date)); // newest first
  }
  return byJob;
}

// Refresh the rolling-90-day labor aggregates. Called by the cron so the
// Recurring Clients page reads precomputed data instantly.
export async function refreshLaborAggregates(supabase, sinceDays = 90) {
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - sinceDays * 86400000).toISOString().slice(0, 10);
  const grouped = await loadLaborGrouped({ start, end: today, skipLineItems: true, skipJobExpenses: true });
  const byJob = buildLaborAggregates(grouped);
  // app_state has a NOT NULL org_id; reuse whichever one this hub is using.
  const { data: existing } = await supabase.from('app_state')
    .select('org_id').eq('key', 'labor-aggregates').maybeSingle();
  let orgId = existing?.org_id;
  if (!orgId) {
    const { data: any } = await supabase.from('app_state').select('org_id').not('org_id', 'is', null).limit(1).maybeSingle();
    orgId = any?.org_id;
  }
  const payload = {
    key: 'labor-aggregates',
    value: { byJob, window: { start, end: today, sinceDays }, updatedAt: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  };
  if (orgId) payload.org_id = orgId;
  const { error: upsertErr } = await supabase.from('app_state').upsert(payload, { onConflict: 'key' });
  if (upsertErr) throw new Error(`labor-aggregates upsert: ${upsertErr.message}`);
  return { jobs: Object.keys(byJob).length, window: { start, end: today } };
}

// ── YTD Revenue from Completed Visits ──

async function handleYTDRevenue(req, res) {
  const year = new Date().getFullYear();
  const start = `${year}-01-01`;
  const today = new Date().toISOString().split('T')[0];
  const visits = await fetchVisits(start, today);

  // Count each job only once — use the first completed visit date for the month
  const jobsSeen = {}; // jobId -> { total, month }
  for (const v of visits) {
    const jobId = v.job?.id;
    if (!jobId || jobsSeen[jobId]) continue;
    const amt = parseFloat(v.job?.total) || 0;
    const date = (v.completedAt || v.startAt || '').split('T')[0];
    const month = date.slice(0, 7);
    jobsSeen[jobId] = { total: amt, month };
  }

  let total = 0;
  const byMonth = {};
  for (const { total: amt, month } of Object.values(jobsSeen)) {
    total += amt;
    byMonth[month] = (byMonth[month] || 0) + amt;
  }
  return res.json({ ytdRevenue: Math.round(total * 100) / 100, jobCount: Object.keys(jobsSeen).length, byMonth });
}

// ── Live Crew Status (who's clocked in right now) ──

// Lightweight read-only today's visits for the Schedule tab.
// Cached per-day for 60s so the schedule can poll without hammering Jobber.
const todayVisitsCache = new Map(); // date -> { data, time }
const TODAY_VISITS_TTL = 60 * 1000;

// Open quotes / new requests — daily-focus overlays for the Plan panel.
// Cached for 2 min since these change far less often than visits.
let openQuotesCache = null; // { data, time }
let newRequestsCache = null;
let requestsHistoryCache = null;
let quotesHistoryCache = null;
let bookedHistoryCache = null;
const OPEN_QUOTES_TTL = 2 * 60 * 1000;
const NEW_REQUESTS_TTL = 2 * 60 * 1000;
const REQUESTS_HISTORY_TTL = 5 * 60 * 1000;
const QUOTES_HISTORY_TTL = 5 * 60 * 1000;
const BOOKED_HISTORY_TTL = 5 * 60 * 1000;

// Christmas-lights quotes in Jobber (any status): title or a line item mentions
// lights / Christmas / C9. Cached 10 min so it doesn't eat the API budget.
let lightsQuotesCache = null; // { data, time }
const LIGHTS_QUOTES_TTL = 2 * 60 * 1000;
const LIGHTS_RE = /\b(lights?|lites?|lighting)\b|christmas|holiday|\bc9\b/i;
async function handleLightsQuotes(req, res) {
  if (lightsQuotesCache && Date.now() - lightsQuotesCache.time < LIGHTS_QUOTES_TTL && !req.query.fresh) {
    return res.json({ quotes: lightsQuotesCache.data, cached: true });
  }
  // Older copy? Answer with it now and refresh in the background, so the page is instant.
  if (lightsQuotesCache && !req.query.fresh && !req.query._bg) {
    res.json({ quotes: lightsQuotesCache.data, cached: true, refreshing: true });
    handleLightsQuotes({ query: { _bg: 1 } }, { json: () => {}, status: () => ({ json: () => {} }) }).catch(() => {});
    return undefined;
  }
  try {
    const data = await jobberQuery(`{
      quotes(first: 100) {
        nodes {
          id quoteNumber quoteStatus title
          amounts { total }
          createdAt updatedAt sentAt
          client { id firstName lastName companyName }
          lineItems(first: 15) { nodes { name } }
        }
      }
    }`);
    const quotes = (data.quotes?.nodes || [])
      .filter((q) => LIGHTS_RE.test(q.title || '') || (q.lineItems?.nodes || []).some((li) => LIGHTS_RE.test(li.name || '')))
      .map((q) => ({
        id: q.id,
        quoteNumber: q.quoteNumber,
        title: q.title || '',
        status: String(q.quoteStatus || '').toLowerCase(),
        total: q.amounts?.total || 0,
        sentAt: q.sentAt,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
        // person's name first; business name only when there's no person
        clientName: `${q.client?.firstName || ''} ${q.client?.lastName || ''}`.trim() || q.client?.companyName || 'Unknown',
        companyName: q.client?.companyName || '',
        clientId: q.client?.id || null,
      }))
      .sort((a, b) => new Date(b.sentAt || b.createdAt || 0) - new Date(a.sentAt || a.createdAt || 0));
    lightsQuotesCache = { data: quotes, time: Date.now() };
    return res.json({ quotes, cached: false });
  } catch (err) {
    console.error('[lights-quotes]', err.message);
    if (lightsQuotesCache) return res.json({ quotes: lightsQuotesCache.data, cached: true, stale: true, error: err.message });
    return res.status(err.code === 'JOBBER_DISCONNECTED' ? 401 : 500).json({ error: err.message });
  }
}

// Recent jobs with their first visit date — light enough not to get throttled.
// The Lights dashboard decides which are lights jobs (title or client of a lights quote).
let recentJobsCache = null; // { data, time }
async function handleRecentJobs(req, res) {
  if (recentJobsCache && Date.now() - recentJobsCache.time < 2 * 60 * 1000 && !req.query.fresh) {
    return res.json({ jobs: recentJobsCache.data, cached: true });
  }
  // Older copy? Answer with it now and refresh in the background, so the page is instant.
  if (recentJobsCache && !req.query.fresh && !req.query._bg) {
    res.json({ jobs: recentJobsCache.data, cached: true, refreshing: true });
    handleRecentJobs({ query: { _bg: 1 } }, { json: () => {}, status: () => ({ json: () => {} }) }).catch(() => {});
    return undefined;
  }
  try {
    const data = await jobberQuery(`{
      jobs(first: 40, sort: [{key: CREATED_AT, direction: DESCENDING}]) {
        nodes {
          id jobNumber title jobStatus createdAt total
          client { id firstName lastName companyName }
          visits(first: 8) { nodes { id title startAt completedAt } }
        }
      }
    }`);
    const jobs = (data.jobs?.nodes || []).map((j) => ({
      // Every visit (install, takedown, …) with its title and date; unscheduled = no startAt.
      visits: (j.visits?.nodes || []).map((v) => ({ id: v.id, title: v.title || '', startAt: v.startAt || null, done: !!v.completedAt }))
        .sort((a, b) => (a.startAt ? new Date(a.startAt) : Infinity) - (b.startAt ? new Date(b.startAt) : Infinity)),
      id: j.id,
      jobNumber: j.jobNumber,
      title: j.title || '',
      status: String(j.jobStatus || '').toLowerCase(),
      total: j.total || 0,
      createdAt: j.createdAt,
      clientId: j.client?.id || null,
      clientName: `${j.client?.firstName || ''} ${j.client?.lastName || ''}`.trim() || j.client?.companyName || 'Unknown',
      visitAt: j.visits?.nodes?.[0]?.startAt || null,
      visitDone: !!j.visits?.nodes?.[0]?.completedAt,
    }));
    recentJobsCache = { data: jobs, time: Date.now() };
    return res.json({ jobs, cached: false });
  } catch (err) {
    console.error('[recent-jobs]', err.message);
    if (recentJobsCache) return res.json({ jobs: recentJobsCache.data, cached: true, stale: true, error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

async function handleOpenQuotes(req, res) {
  if (openQuotesCache && Date.now() - openQuotesCache.time < OPEN_QUOTES_TTL) {
    return res.json({ quotes: openQuotesCache.data, cached: true });
  }
  try {
    // Fetch the most recent 50 quotes; filter open ones in JS.
    // Open = needs your attention: draft, awaiting_response, or sent-but-not-acted-on.
    const data = await jobberQuery(`{
      quotes(first: 50) {
        nodes {
          id quoteNumber quoteStatus
          amounts { total }
          updatedAt sentAt
          client { firstName lastName companyName }
        }
      }
    }`);
    const OPEN = new Set(['draft', 'awaiting_response']);
    const quotes = (data.quotes?.nodes || [])
      .filter((q) => OPEN.has((q.quoteStatus || '').toLowerCase()))
      .map((q) => ({
        id: q.id,
        quoteNumber: q.quoteNumber,
        status: q.quoteStatus,
        total: q.amounts?.total || 0,
        sentAt: q.sentAt,
        updatedAt: q.updatedAt,
        clientName: q.client?.companyName || `${q.client?.firstName || ''} ${q.client?.lastName || ''}`.trim() || 'Unknown',
      }))
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    openQuotesCache = { data: quotes, time: Date.now() };
    return res.json({ quotes, cached: false });
  } catch (err) {
    console.error('[open-quotes]', err.message);
    if (openQuotesCache) return res.json({ quotes: openQuotesCache.data, cached: true, stale: true });
    if (err.code === 'JOBBER_DISCONNECTED') return res.status(401).json({ error: err.message, code: 'JOBBER_DISCONNECTED' });
    return res.status(500).json({ error: err.message });
  }
}

// Christmas-lights requests in Jobber: title mentions "lights". Includes the
// assessment visit so the dashboard can show what's on the schedule.
let lightsRequestsCache = null; // { data, time }
async function handleLightsRequests(req, res) {
  if (lightsRequestsCache && Date.now() - lightsRequestsCache.time < 2 * 60 * 1000 && !req.query.fresh) {
    return res.json({ requests: lightsRequestsCache.data, cached: true });
  }
  // Older copy? Answer with it now and refresh in the background, so the page is instant.
  if (lightsRequestsCache && !req.query.fresh && !req.query._bg) {
    res.json({ requests: lightsRequestsCache.data, cached: true, refreshing: true });
    handleLightsRequests({ query: { _bg: 1 } }, { json: () => {}, status: () => ({ json: () => {} }) }).catch(() => {});
    return undefined;
  }
  try {
    const data = await jobberQuery(`{
      requests(first: 100) {
        nodes {
          id title requestStatus createdAt
          client { firstName lastName companyName }
          property { address { street city } }
          assessment { startAt endAt completedAt }
        }
      }
    }`);
    const requests = (data.requests?.nodes || [])
      .filter((r) => /\b(lights?|lites?|lighting)\b/i.test(r.title || ''))
      .map((r) => ({
        id: r.id,
        title: r.title || '',
        status: String(r.requestStatus || '').toLowerCase(),
        createdAt: r.createdAt,
        clientName: `${r.client?.firstName || ''} ${r.client?.lastName || ''}`.trim() || r.client?.companyName || 'Unknown',
        address: [r.property?.address?.street, r.property?.address?.city].filter(Boolean).join(', '),
        assessmentAt: r.assessment?.startAt || null,
        assessmentDone: !!r.assessment?.completedAt,
      }))
      .sort((a, b) => new Date(a.assessmentAt || '2999-01-01') - new Date(b.assessmentAt || '2999-01-01'));
    lightsRequestsCache = { data: requests, time: Date.now() };
    return res.json({ requests, cached: false });
  } catch (err) {
    console.error('[lights-requests]', err.message);
    if (lightsRequestsCache) return res.json({ requests: lightsRequestsCache.data, cached: true, stale: true, error: err.message });
    return res.status(err.code === 'JOBBER_DISCONNECTED' ? 401 : 500).json({ error: err.message });
  }
}

async function handleNewRequests(req, res) {
  if (newRequestsCache && Date.now() - newRequestsCache.time < NEW_REQUESTS_TTL) {
    return res.json({ requests: newRequestsCache.data, cached: true });
  }
  try {
    const data = await jobberQuery(`{
      requests(first: 50) {
        nodes {
          id requestStatus source createdAt
          client { firstName lastName companyName }
        }
      }
    }`);
    const OPEN = new Set(['new', 'today', 'upcoming']);
    const requests = (data.requests?.nodes || [])
      .filter((r) => OPEN.has((r.requestStatus || '').toLowerCase()))
      .map((r) => ({
        id: r.id,
        status: r.requestStatus,
        source: r.source,
        createdAt: r.createdAt,
        clientName: r.client?.companyName || `${r.client?.firstName || ''} ${r.client?.lastName || ''}`.trim() || 'Unknown',
      }))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    newRequestsCache = { data: requests, time: Date.now() };
    return res.json({ requests, cached: false });
  } catch (err) {
    console.error('[new-requests]', err.message);
    if (newRequestsCache) return res.json({ requests: newRequestsCache.data, cached: true, stale: true });
    if (err.code === 'JOBBER_DISCONNECTED') return res.status(401).json({ error: err.message, code: 'JOBBER_DISCONNECTED' });
    return res.status(500).json({ error: err.message });
  }
}

// 12-week weekly histogram of requests created. Used by the Home page Requests card.
async function handleRequestsHistory(req, res) {
  if (requestsHistoryCache && Date.now() - requestsHistoryCache.time < REQUESTS_HISTORY_TTL) {
    return res.json({ ...requestsHistoryCache.data, cached: true });
  }
  try {
    // Paginate up to ~300 most-recent requests; 12 weeks at ~25/wk max is plenty.
    const all = [];
    let cursor = null;
    for (let i = 0; i < 6; i++) {
      const after = cursor ? `, after: "${cursor}"` : '';
      const data = await jobberQuery(`{
        requests(first: 50${after}) {
          nodes {
            id createdAt requestStatus source title
            client { firstName lastName companyName }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`);
      const nodes = data.requests?.nodes || [];
      all.push(...nodes);
      const pi = data.requests?.pageInfo;
      if (!pi?.hasNextPage) break;
      cursor = pi.endCursor;
    }

    // Bucket into the last 12 ISO weeks (Mon-anchored), oldest → newest.
    const now = new Date();
    const startOfThisWeek = new Date(now);
    const day = startOfThisWeek.getDay(); // 0=Sun
    const diffToMon = (day === 0 ? -6 : 1 - day);
    startOfThisWeek.setHours(0, 0, 0, 0);
    startOfThisWeek.setDate(startOfThisWeek.getDate() + diffToMon);

    const weeks = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(startOfThisWeek);
      start.setDate(start.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      weeks.push({ start, end, count: 0, items: [], label: `${start.getMonth() + 1}/${start.getDate()}` });
    }

    for (const r of all) {
      if (!r.createdAt) continue;
      const t = new Date(r.createdAt);
      const clientName = r.client?.companyName
        || [r.client?.firstName, r.client?.lastName].filter(Boolean).join(' ')
        || 'Unknown';
      for (const w of weeks) {
        if (t >= w.start && t < w.end) {
          w.count++;
          w.items.push({ id: r.id, label: clientName, sub: r.title || r.requestStatus, when: r.createdAt });
          break;
        }
      }
    }

    const payload = {
      weeks: weeks.map((w) => ({ label: w.label, start: w.start.toISOString(), count: w.count, items: w.items })),
      thisWeek: weeks[weeks.length - 1].count,
      lastWeek: weeks[weeks.length - 2]?.count || 0,
      total12w: weeks.reduce((s, w) => s + w.count, 0),
    };
    requestsHistoryCache = { data: payload, time: Date.now() };
    return res.json({ ...payload, cached: false });
  } catch (err) {
    console.error('[requests-history]', err.message);
    if (requestsHistoryCache) return res.json({ ...requestsHistoryCache.data, cached: true, stale: true });
    if (err.code === 'JOBBER_DISCONNECTED') return res.status(401).json({ error: err.message, code: 'JOBBER_DISCONNECTED' });
    return res.status(500).json({ error: err.message });
  }
}

// 12-week histogram of quotes sent (and their total $).
async function handleQuotesHistory(req, res) {
  if (quotesHistoryCache && Date.now() - quotesHistoryCache.time < QUOTES_HISTORY_TTL) {
    return res.json({ ...quotesHistoryCache.data, cached: true });
  }
  try {
    const all = [];
    let cursor = null;
    for (let i = 0; i < 8; i++) {
      const after = cursor ? `, after: "${cursor}"` : '';
      const data = await jobberQuery(`{
        quotes(first: 50${after}) {
          nodes {
            id createdAt sentAt quoteStatus quoteNumber amounts { total }
            client { firstName lastName companyName }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`);
      const nodes = data.quotes?.nodes || [];
      all.push(...nodes);
      const pi = data.quotes?.pageInfo;
      if (!pi?.hasNextPage) break;
      cursor = pi.endCursor;
    }

    const now = new Date();
    const startOfThisWeek = new Date(now);
    const day = startOfThisWeek.getDay();
    const diffToMon = (day === 0 ? -6 : 1 - day);
    startOfThisWeek.setHours(0, 0, 0, 0);
    startOfThisWeek.setDate(startOfThisWeek.getDate() + diffToMon);

    const weeks = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(startOfThisWeek);
      start.setDate(start.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      weeks.push({ start, end, count: 0, amount: 0, items: [], label: `${start.getMonth() + 1}/${start.getDate()}` });
    }

    for (const q of all) {
      const ts = q.sentAt || q.createdAt;
      if (!ts) continue;
      const t = new Date(ts);
      const amt = Number(q.amounts?.total || 0);
      const clientName = q.client?.companyName
        || [q.client?.firstName, q.client?.lastName].filter(Boolean).join(' ')
        || 'Unknown';
      for (const w of weeks) {
        if (t >= w.start && t < w.end) {
          w.count++;
          w.amount += amt;
          w.items.push({ id: q.id, label: clientName, sub: q.quoteNumber ? `#${q.quoteNumber} · ${q.quoteStatus || ''}` : (q.quoteStatus || ''), amount: amt, when: ts });
          break;
        }
      }
    }

    const payload = {
      weeks: weeks.map((w) => ({ label: w.label, start: w.start.toISOString(), count: w.count, amount: Math.round(w.amount), items: w.items })),
      thisWeek: weeks[weeks.length - 1].count,
      lastWeek: weeks[weeks.length - 2]?.count || 0,
      thisWeekAmount: Math.round(weeks[weeks.length - 1].amount),
      total12w: weeks.reduce((s, w) => s + w.count, 0),
      total12wAmount: Math.round(weeks.reduce((s, w) => s + w.amount, 0)),
    };
    quotesHistoryCache = { data: payload, time: Date.now() };
    return res.json({ ...payload, cached: false });
  } catch (err) {
    console.error('[quotes-history]', err.message);
    if (quotesHistoryCache) return res.json({ ...quotesHistoryCache.data, cached: true, stale: true });
    if (err.code === 'JOBBER_DISCONNECTED') return res.status(401).json({ error: err.message, code: 'JOBBER_DISCONNECTED' });
    return res.status(500).json({ error: err.message });
  }
}

// 12-week histogram of recurring jobs booked (by start_date) — the "won deals" step of the funnel.
async function handleBookedHistory(req, res) {
  if (bookedHistoryCache && Date.now() - bookedHistoryCache.time < BOOKED_HISTORY_TTL) {
    return res.json({ ...bookedHistoryCache.data, cached: true });
  }
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date();
    const startOfThisWeek = new Date(now);
    const day = startOfThisWeek.getDay();
    const diffToMon = (day === 0 ? -6 : 1 - day);
    startOfThisWeek.setHours(0, 0, 0, 0);
    startOfThisWeek.setDate(startOfThisWeek.getDate() + diffToMon);
    const earliest = new Date(startOfThisWeek);
    earliest.setDate(earliest.getDate() - 11 * 7);

    // Pull EVERY recurring job ever (all statuses) so we can find each contact's
    // first-ever recurring activity. A contact only counts as "new recurring"
    // in a given week if their earliest recurring job (by created_at) was
    // created in that week. start_date is irrelevant.
    const { data: jobs, error } = await supabase
      .from('hub_jobs')
      .select('id, contact_id, created_at, total_amount, title, type, status, contacts:contact_id ( name )')
      .eq('type', 'recurring');
    if (error) throw new Error(error.message);

    const firstByContact = new Map();
    for (const j of jobs || []) {
      if (!j.contact_id || !j.created_at) continue;
      const existing = firstByContact.get(j.contact_id);
      if (!existing || j.created_at < existing.created_at) {
        firstByContact.set(j.contact_id, {
          contact_id: j.contact_id,
          created_at: j.created_at,
          amount: Number(j.total_amount || 0),
          title: j.title,
          name: j.contacts?.name || 'Unknown',
        });
      }
    }

    const weeks = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(startOfThisWeek);
      start.setDate(start.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      weeks.push({ start, end, count: 0, amount: 0, items: [], label: `${start.getMonth() + 1}/${start.getDate()}` });
    }
    for (const rec of firstByContact.values()) {
      const t = new Date(rec.created_at);
      for (const w of weeks) {
        if (t >= w.start && t < w.end) {
          w.count++;
          w.amount += rec.amount;
          w.items.push({ id: rec.contact_id, label: rec.name, sub: rec.title || '', amount: rec.amount, when: rec.created_at });
          break;
        }
      }
    }

    const payload = {
      weeks: weeks.map((w) => ({ label: w.label, start: w.start.toISOString(), count: w.count, amount: Math.round(w.amount), items: w.items })),
      thisWeek: weeks[weeks.length - 1].count,
      lastWeek: weeks[weeks.length - 2]?.count || 0,
      total12w: weeks.reduce((s, w) => s + w.count, 0),
      total12wAmount: Math.round(weeks.reduce((s, w) => s + w.amount, 0)),
    };
    bookedHistoryCache = { data: payload, time: Date.now() };
    return res.json({ ...payload, cached: false });
  } catch (err) {
    console.error('[booked-history]', err.message);
    if (bookedHistoryCache) return res.json({ ...bookedHistoryCache.data, cached: true, stale: true });
    return res.status(500).json({ error: err.message });
  }
}

async function handleTodayVisits(req, res) {
  const today = req.query.date || new Date().toISOString().split('T')[0];
  const cached = todayVisitsCache.get(today);
  if (cached && Date.now() - cached.time < TODAY_VISITS_TTL) {
    return res.json({ visits: cached.data, cached: true });
  }
  try {
    const startISO = new Date(today + 'T00:00:00').toISOString();
    const endPlusOne = new Date(today + 'T00:00:00');
    endPlusOne.setDate(endPlusOne.getDate() + 1);
    const endISO = endPlusOne.toISOString();
    // Cost-conscious: dropped property{address} and job.client (2-3x cost each).
    // Kept assignedUsers since the planner needs "who's it assigned to".
    const data = await jobberQuery(`{
      visits(first: 25, filter: { startAt: { after: "${startISO}", before: "${endISO}" } }) {
        nodes {
          id title startAt endAt completedAt
          job { id jobNumber }
          assignedUsers { nodes { id name { full } } }
        }
      }
    }`);
    // Local-date guard: Jobber's filter on startAt is inclusive of the upper bound,
    // so a visit at *exactly* tomorrow 00:00 local can leak into today. Re-check
    // each result's local date matches the requested day, and dedupe by id.
    const seen = new Set();
    const visits = (data.visits?.nodes || []).filter((v) => {
      if (!v.startAt) return false;
      if (seen.has(v.id)) return false;
      seen.add(v.id);
      const dt = new Date(v.startAt);
      const localISO = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      return localISO === today;
    }).map((v) => ({
      id: v.id,
      title: v.title || '',
      startAt: v.startAt,
      endAt: v.endAt,
      completedAt: v.completedAt,
      jobNumber: v.job?.jobNumber || null,
      jobType: null,
      jobStatus: null,
      clientName: v.title || 'Visit',
      address: '',
      assignees: (v.assignedUsers?.nodes || []).map((u) => u.name?.full || '').filter(Boolean),
    })).sort((a, b) => new Date(a.startAt || 0) - new Date(b.startAt || 0));
    todayVisitsCache.set(today, { data: visits, time: Date.now() });
    return res.json({ visits, cached: false });
  } catch (err) {
    console.error('[today-visits]', err.message);
    if (cached) return res.json({ visits: cached.data, cached: true, stale: true });
    if (err.code === 'JOBBER_DISCONNECTED') return res.status(401).json({ error: err.message, code: 'JOBBER_DISCONNECTED' });
    return res.status(500).json({ error: err.message });
  }
}

// ── Month-range Jobber visits for the Schedule calendar ──
// Cached per (start, end) key for 10 min. On throttle, returns last cached
// version with stale: true so the calendar never goes blank.
const monthVisitsCache = new Map(); // "start|end" -> { data, time }
const MONTH_VISITS_TTL = 10 * 60 * 1000;

async function handleMonthVisits(req, res) {
  const startStr = req.query.start; // YYYY-MM-DD
  const endStr = req.query.end;     // YYYY-MM-DD (exclusive)
  if (!startStr || !endStr) return res.status(400).json({ error: 'start and end (YYYY-MM-DD) query params required' });

  const cacheKey = `${startStr}|${endStr}`;
  const cached = monthVisitsCache.get(cacheKey);
  if (cached && Date.now() - cached.time < MONTH_VISITS_TTL) {
    return res.json({ visits: cached.data, cached: true });
  }
  try {
    const startISO = new Date(startStr + 'T00:00:00').toISOString();
    const endISO = new Date(endStr + 'T00:00:00').toISOString();
    const data = await jobberQuery(`{
      visits(first: 200, filter: { startAt: { after: "${startISO}", before: "${endISO}" } }) {
        nodes {
          id title startAt endAt completedAt
          property { address { street1 city province postalCode } }
          job {
            id jobNumber jobType jobStatus
            client { firstName lastName }
          }
          assignedUsers { nodes { id name { full } } }
        }
      }
    }`);
    const visits = (data.visits?.nodes || []).map((v) => ({
      id: v.id,
      title: v.title || '',
      startAt: v.startAt,
      endAt: v.endAt,
      completedAt: v.completedAt,
      jobNumber: v.job?.jobNumber || null,
      jobType: v.job?.jobType || null,
      jobStatus: v.job?.jobStatus || null,
      clientName: v.job?.client ? `${v.job.client.firstName || ''} ${v.job.client.lastName || ''}`.trim() : 'Unknown',
      address: v.property?.address ? [v.property.address.street1, v.property.address.city, v.property.address.province].filter(Boolean).join(', ') : '',
      assignees: (v.assignedUsers?.nodes || []).map((u) => u.name?.full || u.id).filter(Boolean),
    })).sort((a, b) => new Date(a.startAt || 0) - new Date(b.startAt || 0));
    monthVisitsCache.set(cacheKey, { data: visits, time: Date.now() });
    return res.json({ visits, cached: false });
  } catch (err) {
    console.error('[month-visits]', err.message);
    if (cached) return res.json({ visits: cached.data, cached: true, stale: true, error: err.message });
    if (err.code === 'JOBBER_DISCONNECTED') return res.status(401).json({ error: err.message, code: 'JOBBER_DISCONNECTED' });
    return res.status(500).json({ error: err.message });
  }
}

async function handleCrewStatus(req, res) {
  const todayISO = new Date().toISOString().split('T')[0] + 'T00:00:00Z';
  const data = await jobberQuery(`{ timeSheetEntries(first: 100, filter: { startAt: { after: "${todayISO}" } }) { nodes { startAt endAt duration user { name { full } } job { id jobNumber title client { firstName lastName } } } } }`);

  const entries = data.timeSheetEntries?.nodes || [];
  const active = [];
  const completed = [];

  for (const t of entries) {
    const person = t.user?.name?.full || 'Unknown';
    const client = t.job?.client ? `${t.job.client.firstName} ${t.job.client.lastName}`.trim() : null;
    const jobTitle = t.job?.title || null;

    if (!t.endAt) {
      // Currently clocked in
      const startMs = new Date(t.startAt).getTime();
      const elapsedMin = Math.round((Date.now() - startMs) / 60000);
      active.push({ person, client, jobTitle, startAt: t.startAt, elapsedMin });
    }
  }

  // Also summarize who worked today (unique people)
  const people = {};
  for (const t of entries) {
    const person = t.user?.name?.full || 'Unknown';
    if (!people[person]) people[person] = { totalMin: 0, jobs: 0 };
    people[person].totalMin += Math.round((t.duration || 0) / 60);
    if (t.job?.id) people[person].jobs++;
  }

  return res.json({ active, people });
}

// ── Hub Sync (canonical schema: contacts, hub_jobs, hub_visits) ──
// Source-agnostic by design: the UI never reads from Jobber. Replacing Jobber
// later means swapping this sync, not rewriting screens.

function syncFormatAddress(addr) {
  if (!addr) return null;
  return [addr.street1, addr.street2, addr.city, addr.province, addr.postalCode]
    .filter(Boolean).join(', ') || null;
}

async function setSyncCursor(supabase, key, isoString) {
  await supabase
    .from('hub_sync_state')
    .upsert({ key, value: { last_synced_at: isoString } }, { onConflict: 'key' });
}

const HUB_CLIENTS_QUERY = `
  query SyncClients($cursor: String) {
    clients(first: 50, after: $cursor) {
      nodes {
        id firstName lastName companyName
        phones { number }
        emails { address }
        billingAddress { street1 street2 city province postalCode }
      }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

async function syncJobberClients(supabase) {
  let cursor = null, totalUpserted = 0, pages = 0;
  do {
    const data = await jobberQuery(HUB_CLIENTS_QUERY, { cursor });
    const nodes = data.clients?.nodes || [];
    pages++;
    if (nodes.length > 0) {
      const rows = nodes.map((c) => ({
        name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.companyName || 'Unknown',
        phone: c.phones?.[0]?.number || null,
        email: c.emails?.[0]?.address || null,
        address_line1: c.billingAddress?.street1 || null,
        address_city: c.billingAddress?.city || null,
        address_state: c.billingAddress?.province || null,
        address_zip: c.billingAddress?.postalCode || null,
        jobber_client_id: c.id,
      }));
      const { error } = await supabase
        .from('contacts')
        .upsert(rows, { onConflict: 'jobber_client_id', ignoreDuplicates: false });
      if (error) throw new Error(`contacts upsert failed: ${error.message}`);
      totalUpserted += rows.length;
    }
    cursor = data.clients?.pageInfo?.hasNextPage ? data.clients.pageInfo.endCursor : null;
    if (cursor) await new Promise((r) => setTimeout(r, 600));
  } while (cursor);
  await setSyncCursor(supabase, 'jobber_clients_last_sync', new Date().toISOString());
  return { upserted: totalUpserted, pages };
}

// IMPORTANT: assignedUsers excluded — Jobber throttles aggressively on that nested query.
const HUB_VISITS_QUERY = `
  query SyncVisits($cursor: String, $startISO: ISO8601DateTime!, $endISO: ISO8601DateTime!) {
    visits(first: 50, after: $cursor, filter: { startAt: { after: $startISO, before: $endISO } }) {
      nodes {
        id title startAt endAt completedAt
        property { address { street1 street2 city province postalCode } }
        job {
          id jobNumber jobType jobStatus title total startAt endAt
          visitSchedule { startDate endDate recurrenceSchedule { calendarRule } }
          client { id firstName lastName companyName }
        }
      }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

// Parse RRULE → frequency label + visits-per-month.
// Hey Jude's only runs Weekly (W) or every-other-week (EOW); anything else stays "Recurring".
function parseRecurrence(calendarRule) {
  if (!calendarRule) return { label: null, visitsPerMonth: null };
  const freqMatch = calendarRule.match(/FREQ=(\w+)/);
  const intervalMatch = calendarRule.match(/INTERVAL=(\d+)/);
  const freq = freqMatch ? freqMatch[1] : null;
  const interval = intervalMatch ? parseInt(intervalMatch[1]) : 1;
  if (freq !== 'WEEKLY') return { label: 'Recurring', visitsPerMonth: null };
  if (interval === 1) return { label: 'W', visitsPerMonth: 30 / 7 };
  if (interval === 2) return { label: 'EOW', visitsPerMonth: 30 / 14 };
  return { label: `Every ${interval} weeks`, visitsPerMonth: 30 / (7 * interval) };
}

export async function syncJobberVisits(supabase, sinceDays = 60, untilDays = 90) {
  const now = new Date();
  const startISO = new Date(now.getTime() - sinceDays * 86400000).toISOString();
  const endISO = new Date(now.getTime() + untilDays * 86400000).toISOString();

  let cursor = null, totalVisits = 0, totalJobs = 0, pages = 0;
  const contactByJobberId = new Map();
  const jobBySourceId = new Map();

  const ensureContact = async (jobberClient) => {
    if (!jobberClient?.id) return null;
    if (contactByJobberId.has(jobberClient.id)) return contactByJobberId.get(jobberClient.id);
    const name = [jobberClient.firstName, jobberClient.lastName].filter(Boolean).join(' ') || jobberClient.companyName || 'Unknown';
    const { data: existing } = await supabase
      .from('contacts').select('id').eq('jobber_client_id', jobberClient.id).maybeSingle();
    let contactId = existing?.id || null;
    if (!contactId) {
      const { data: inserted, error } = await supabase
        .from('contacts')
        .upsert({ name, jobber_client_id: jobberClient.id }, { onConflict: 'jobber_client_id' })
        .select('id').single();
      if (error) throw new Error(`contact upsert failed for ${jobberClient.id}: ${error.message}`);
      contactId = inserted.id;
    }
    contactByJobberId.set(jobberClient.id, contactId);
    return contactId;
  };

  const ensureJob = async (jobberJob, contactId) => {
    if (!jobberJob?.id) return null;
    if (jobBySourceId.has(jobberJob.id)) return jobBySourceId.get(jobberJob.id);
    const typeMap = { ONE_OFF: 'one_off', RECURRING: 'recurring' };
    const statusMap = { ACTIVE: 'active', ARCHIVED: 'archived', LATE: 'active', UPCOMING: 'active', TODAY: 'active', ACTION_REQUIRED: 'active', ON_HOLD: 'active', UNSCHEDULED: 'active', REQUIRES_INVOICING: 'completed', LATE_TO_INVOICE: 'completed', INVOICED: 'completed' };
    const calendarRule = jobberJob.visitSchedule?.recurrenceSchedule?.calendarRule || null;
    const { label: freqLabel, visitsPerMonth } = parseRecurrence(calendarRule);
    const row = {
      contact_id: contactId,
      title: jobberJob.title || null,
      type: typeMap[jobberJob.jobType] || 'one_off',
      status: statusMap[jobberJob.jobStatus] || 'active',
      job_number: jobberJob.jobNumber ? String(jobberJob.jobNumber) : null,
      total_amount: jobberJob.total != null ? Number(jobberJob.total) : null,
      start_date: jobberJob.visitSchedule?.startDate || (jobberJob.startAt ? jobberJob.startAt.slice(0, 10) : null),
      end_date: jobberJob.visitSchedule?.endDate || (jobberJob.endAt ? jobberJob.endAt.slice(0, 10) : null),
      calendar_rule: calendarRule,
      frequency_label: freqLabel,
      visits_per_month: visitsPerMonth,
      source: 'jobber',
      source_id: jobberJob.id,
    };
    const { data, error } = await supabase
      .from('hub_jobs').upsert(row, { onConflict: 'source,source_id' }).select('id').single();
    if (error) throw new Error(`hub_jobs upsert failed for ${jobberJob.id}: ${error.message}`);
    jobBySourceId.set(jobberJob.id, data.id);
    totalJobs++;
    return data.id;
  };

  do {
    const data = await jobberQuery(HUB_VISITS_QUERY, { cursor, startISO, endISO });
    const nodes = data.visits?.nodes || [];
    pages++;
    // One request per page of visits (was one per visit — millions of tiny writes that kept the database maxed, 2026-11-13).
    const pageRows = [];
    for (const v of nodes) {
      const contactId = await ensureContact(v.job?.client);
      const jobId = await ensureJob(v.job, contactId);
      const visitRow = {
        job_id: jobId,
        contact_id: contactId,
        title: v.title || null,
        start_at: v.startAt || null,
        end_at: v.endAt || null,
        completed_at: v.completedAt || null,
        address: syncFormatAddress(v.property?.address),
        status: v.completedAt ? 'completed' : 'scheduled',
        source: 'jobber',
        source_id: v.id,
      };
      pageRows.push(visitRow);
    }
    if (pageRows.length) {
      const { error: visitErr } = await supabase
        .from('hub_visits').upsert(pageRows, { onConflict: 'source,source_id' });
      if (visitErr) throw new Error(`hub_visits upsert failed: ${visitErr.message}`);
      totalVisits += pageRows.length;
    }
    cursor = data.visits?.pageInfo?.hasNextPage ? data.visits.pageInfo.endCursor : null;
    if (cursor) await new Promise((r) => setTimeout(r, 600));
  } while (cursor);

  await setSyncCursor(supabase, 'jobber_visits_last_sync', new Date().toISOString());
  return { visits: totalVisits, jobs: totalJobs, pages, range: { from: startISO, to: endISO } };
}

// Recurring client summary derived from hub_visits + hub_jobs canonical store.
// Source-agnostic — works whether data came from Jobber webhooks or own software.
// Manual overrides for clients whose synced data doesn't match real billing.
// Lowercased client name → { perVisit, frequency: 'W' | 'EOW' }
// Add new entries here as you spot mistakes; restart server to apply.
const CLIENT_OVERRIDES = {
  'jane elmore':    { perVisit: 145 },
  'aaron williams': { frequency: 'EOW' },
};
const FREQ_TO_VPM = { 'W': 30/7, 'EOW': 30/14 };

// Title-based classifier — anything mentioning lawn/mow/maint counts as lawn maintenance,
// everything else (shrub trimming, fertilization, leaf removal, etc.) is "other."
// Untitled jobs default to lawn since lawn is the dominant service.
const LAWN_TITLE_RE = /lawn|mow|maint|grass|turf/i;
const isLawnTitle = (title) => !title || !title.trim() || LAWN_TITLE_RE.test(title);

// Thin SELECT — all enrichment lives in hub_jobs columns populated at sync time.
// Each recurring job becomes one row, classified as lawn vs other vs ended.
// A job is "ended" if status != 'active' OR its end_date has passed.
async function handleRecurringSummary(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    // Pull jobs + precomputed labor aggregates in parallel.
    const [jobsResp, laborResp] = await Promise.all([
      supabase.from('hub_jobs').select(`
        id, contact_id, title, status, source_id,
        total_amount, frequency_label, visits_per_month,
        start_date, end_date,
        contacts:contact_id ( id, name, phone, email, address_line1, address_city, address_state, address_zip )
      `).eq('type', 'recurring').in('status', ['active', 'archived', 'completed']),
      supabase.from('app_state').select('value').eq('key', 'labor-aggregates').maybeSingle(),
    ]);
    if (jobsResp.error) throw new Error(jobsResp.error.message);
    const jobs = jobsResp.data || [];
    const laborByJob = laborResp.data?.value?.byJob || {};
    const laborWindow = laborResp.data?.value?.window || null;
    const laborUpdatedAt = laborResp.data?.value?.updatedAt || null;

    const todayISO = new Date().toISOString().slice(0, 10);
    const isJobEnded = (j) => j.status !== 'active' || (j.end_date && j.end_date < todayISO);

    // Per-job rows with pricing + classification.
    const lawnJobs = [];
    const otherJobs = [];
    const endedJobs = [];
    // Per-contact aggregation kept for backward compat (Commander, DailyChecklist tile).
    const byContact = new Map();

    for (const j of jobs || []) {
      const c = j.contacts;
      if (!c) continue;
      const overrideKey = (c.name || '').trim().toLowerCase();
      const override = CLIENT_OVERRIDES[overrideKey] || {};
      const perVisit = override.perVisit != null
        ? override.perVisit
        : (j.total_amount != null ? Number(j.total_amount) : null);
      const frequency = override.frequency || j.frequency_label || 'Recurring';
      const visitsPerMonth = override.frequency
        ? FREQ_TO_VPM[override.frequency] || null
        : (j.visits_per_month != null ? Number(j.visits_per_month) : null);
      const monthly = perVisit != null && visitsPerMonth ? perVisit * visitsPerMonth : null;
      const ended = isJobEnded(j);
      const labor = laborByJob[j.source_id] || null;

      const row = {
        contactId: c.id,
        sourceId: j.source_id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        address: [c.address_line1, c.address_city, c.address_state].filter(Boolean).join(', '),
        title: j.title || 'Recurring service',
        frequency,
        perVisit,
        monthly,
        startDate: j.start_date,
        endDate: j.end_date,
        ended,
        category: isLawnTitle(j.title) ? 'lawn' : 'other',
        laborPct: labor?.laborPct ?? null,
        laborCost: labor?.labor ?? null,
        laborHours: labor?.hours ?? null,
        laborRevenue: labor?.rev ?? null,
        laborVisits: labor?.visits || [],
      };

      if (ended) endedJobs.push(row);
      else if (row.category === 'lawn') lawnJobs.push(row);
      else otherJobs.push(row);

      // Backward-compat per-contact aggregation (active jobs only).
      if (!ended) {
        if (!byContact.has(j.contact_id)) {
          byContact.set(j.contact_id, {
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email,
            address: row.address,
            jobs: [],
            monthly: null,
            perVisit: null,
          });
        }
        const entry = byContact.get(j.contact_id);
        entry.jobs.push({
          title: row.title,
          frequency,
          perVisit,
          monthly,
          startDate: row.startDate,
          endDate: row.endDate,
          services: j.title ? [j.title] : [],
        });
        if (perVisit != null) entry.perVisit = (entry.perVisit || 0) + perVisit;
        if (monthly != null) entry.monthly = (entry.monthly || 0) + monthly;
      }
    }

    const sortRows = (a, b) => a.name.localeCompare(b.name) || a.title.localeCompare(b.title);
    lawnJobs.sort(sortRows);
    otherJobs.sort(sortRows);
    endedJobs.sort(sortRows);

    const activeClientList = Array.from(byContact.values()).sort((a, b) => a.name.localeCompare(b.name));
    const uniqueActiveClientCount = activeClientList.length;
    const monthlyRecurringRevenue = Math.round(
      [...lawnJobs, ...otherJobs].reduce((s, r) => s + (r.monthly || 0), 0) * 100
    ) / 100;

    return res.json({
      // New per-job structure
      lawnJobs,
      otherJobs,
      endedJobs,
      uniqueActiveClientCount,
      labor: { window: laborWindow, updatedAt: laborUpdatedAt, jobsRated: Object.keys(laborByJob).length },
      // Backward-compat fields
      activeRecurringCount: uniqueActiveClientCount,
      activeRecurringJobs: lawnJobs.length + otherJobs.length,
      recurringClientList: activeClientList,
      endedRecurringCount: endedJobs.length,
      monthlyRecurringRevenue,
      source: 'hub',
    });
  } catch (err) {
    console.error('[recurring-summary]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// One-shot: pull every job's true createdAt from Jobber and overwrite
// hub_jobs.created_at so historical funnel charts read actual booking dates
// instead of the day Hub first synced.
async function handleBackfillJobDates(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    const all = [];
    let cursor = null;
    let pages = 0;
    for (;;) {
      const after = cursor ? `, after: "${cursor}"` : '';
      const data = await jobberQuery(`{
        jobs(first: 50${after}) {
          nodes { id createdAt }
          pageInfo { hasNextPage endCursor }
        }
      }`);
      const nodes = data.jobs?.nodes || [];
      all.push(...nodes);
      pages++;
      const pi = data.jobs?.pageInfo;
      if (!pi?.hasNextPage) break;
      cursor = pi.endCursor;
      if (pages > 40) break; // safety: 2000 jobs max
    }

    let updated = 0;
    let skipped = 0;
    for (const j of all) {
      if (!j.id || !j.createdAt) { skipped++; continue; }
      const { data: rows, error } = await supabase
        .from('hub_jobs')
        .update({ created_at: j.createdAt })
        .eq('source', 'jobber')
        .eq('source_id', j.id)
        .select('id');
      if (error) { skipped++; continue; }
      updated += (rows || []).length;
    }

    bookedHistoryCache = null; // invalidate so next /booked-history call re-buckets
    return res.json({ ok: true, pages, jobsFetched: all.length, rowsUpdated: updated, rowsSkipped: skipped });
  } catch (err) {
    console.error('[backfill-job-dates]', err.message);
    if (err.code === 'JOBBER_DISCONNECTED') return res.status(401).json({ error: err.message, code: 'JOBBER_DISCONNECTED' });
    return res.status(500).json({ error: err.message });
  }
}

async function handleHubSync(req, res) {
  const source = (req.query.source || 'jobber').toLowerCase();
  const entity = (req.query.entity || 'all').toLowerCase();
  if (source !== 'jobber') {
    return res.status(400).json({ error: `Unknown source "${source}". Only "jobber" supported today.` });
  }
  const supabase = getSupabaseAdmin();
  const startedAt = Date.now();
  const result = {};
  try {
    if (entity === 'clients' || entity === 'all') {
      result.clients = await syncJobberClients(supabase);
    }
    if (entity === 'visits' || entity === 'all') {
      const sinceDays = parseInt(req.query.sinceDays || '60', 10);
      const untilDays = parseInt(req.query.untilDays || '90', 10);
      result.visits = await syncJobberVisits(supabase, sinceDays, untilDays);
    }
    result.durationMs = Date.now() - startedAt;
    return res.json({ ok: true, source, entity, ...result });
  } catch (err) {
    console.error('[hub-sync]', err.message);
    if (err instanceof JobberDisconnectedError || err.code === 'JOBBER_DISCONNECTED') {
      return res.status(401).json({ ok: false, error: err.message, code: 'JOBBER_DISCONNECTED' });
    }
    return res.status(500).json({ ok: false, error: err.message, partial: result });
  }
}


// ── One lights job's money after install: price + discount (from its Jobber quote) and labor
// (its own timesheets × each person's Payroll rate). GET ?action=lights-job-summary&jobId=…
async function handleLightsJobSummary(req, res) {
  const jobId = String(req.query.jobId || '');
  if (!/^[A-Za-z0-9=]+$/.test(jobId)) return res.status(400).json({ error: 'jobId required' });
  try {
    const d = await jobberQuery(`{ job(id: "${jobId}") { jobNumber total quote { quoteNumber amounts { subtotal discountAmount total } }
      timeSheetEntries(first: 100) { nodes { startAt endAt finalDuration ticking user { name { full } } } } } }`);
    const job = d.job;
    if (!job) return res.status(404).json({ error: 'Job not found' });
    // Same rates Payroll uses: Team page (greenteam-permissions → payRate). Owner is paid by draw.
    const PAID_BY_DRAW = new Set(['jawdixon1@gmail.com']);
    const { data: perm } = await getSupabaseAdmin().from('app_state').select('value').eq('key', 'greenteam-permissions').maybeSingle();
    const team = Object.entries(perm?.value || {})
      .filter(([email]) => !PAID_BY_DRAW.has(email.toLowerCase()))
      .map(([, v]) => ({ name: String(v.name || '').trim().toLowerCase(), rate: Number(v.payRate) || 0 }))
      .filter((t) => t.name && t.rate > 0);
    const rateFor = (full) => {
      const f = String(full || '').trim().toLowerCase();
      const r = team.find((x) => x.name === f) || team.find((x) => x.name.split(' ')[0] === f.split(' ')[0]);
      return r ? r.rate : null;
    };
    const day = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const entries = (job.timeSheetEntries?.nodes || []).map((e) => {
      const secs = e.finalDuration || (e.endAt ? (new Date(e.endAt) - new Date(e.startAt)) / 1000 : (Date.now() - new Date(e.startAt)) / 1000);
      const name = e.user?.name?.full || 'Unknown';
      const hours = Math.round((secs / 3600) * 100) / 100;
      const rate = rateFor(name);
      return { name, day: day(e.startAt), start: e.startAt, end: e.endAt, ticking: !!e.ticking, hours, rate, cost: rate == null ? null : Math.round(hours * rate * 100) / 100 };
    }).sort((a, b) => a.start.localeCompare(b.start));
    const a = job.quote?.amounts || {};
    return res.json({ jobNumber: job.jobNumber, total: job.total, subtotal: a.subtotal ?? null, discount: a.discountAmount ?? null, quoteNumber: job.quote?.quoteNumber || null, entries });
  } catch (err) {
    if (String(err.message).includes('Throttled')) return res.status(429).json({ error: 'Jobber needs a moment — try again.', code: 'THROTTLED' });
    return res.status(500).json({ error: err.message });
  }
}


// ── Lights job materials → one Expense on the Jobber job (made when it's marked installed, kept in sync
// when the numbers are fixed, deleted on Undo install). POST ?action=lights-job-expense
// Body: { jobId, total, description, date } (+ expenseId to update it) or { expenseId, remove: true }.
async function handleLightsJobExpense(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = req.body || {};
  const id = (v) => /^[A-Za-z0-9=]+$/.test(String(v || ''));
  try {
    // Per material: { jobId, items: [{ key, title, description, total, receiptUrl }], existing: { key: expenseId } }
    // → one expense per item (edit if it exists, else create with its picture as the receipt); old ones not listed are deleted.
    if (Array.isArray(b.items)) {
      if (!id(b.jobId)) return res.status(400).json({ error: 'jobId required' });
      const existing = b.existing && typeof b.existing === 'object' ? { ...b.existing } : {};
      // Self-healing: the Hub's own expenses already on this job (marked in the description) match by title,
      // so a lost link never makes duplicates — and stale ones get cleaned up below.
      const MARK = 'from the Hub (Christmas Lights)';
      const onJob = await jobberQuery(`{ job(id: "${b.jobId}") { expenses(first: 100) { nodes { id title description } } } }`).then((x) => x.job?.expenses?.nodes || []).catch(() => []);
      const hubOnJob = onJob.filter((e) => String(e.description || '').includes(MARK));
      const known = new Set(Object.values(existing));
      for (const it of b.items) if (!id(existing[it.key])) { const m = hubOnJob.find((e) => e.title === it.title && !known.has(e.id)); if (m) { existing[it.key] = m.id; known.add(m.id); } }
      hubOnJob.forEach((e) => { if (!known.has(e.id)) { existing[`_stale_${e.id}`] = e.id; known.add(e.id); } });
      const out = {}; const errors = [];
      const date = b.date || new Date().toISOString();
      for (const it of b.items.slice(0, 40)) {
        const input = { title: String(it.title || 'Material').slice(0, 200), description: String(it.description || '').slice(0, 1000), total: Math.round(Number(it.total || 0) * 100) / 100, date };
        const ex = existing[it.key];
        if (id(ex)) {
          const d = await jobberQuery(`mutation($id: EncodedId!, $input: ExpenseEditInput!) { expenseEdit(expenseId: $id, input: $input) { expense { id } userErrors { message } } }`, { id: ex, input }).catch(() => null);
          if (d?.expenseEdit?.expense?.id && !(d.expenseEdit.userErrors || []).length) { out[it.key] = d.expenseEdit.expense.id; continue; }
        }
        const create = (extra) => jobberQuery(`mutation($input: ExpenseCreateInput!) { expenseCreate(input: $input) { expense { id } userErrors { message } } }`, { input: { ...input, linkedJobId: b.jobId, ...extra } });
        // With its picture as the receipt; if Jobber can't fetch the picture, make it without one.
        let d = /^https:\/\//.test(String(it.receiptUrl || '')) ? await create({ receiptUrl: it.receiptUrl }).catch(() => null) : null;
        if (!d?.expenseCreate?.expense?.id) d = await create({}).catch((e) => ({ err: e.message }));
        if (d?.expenseCreate?.expense?.id) out[it.key] = d.expenseCreate.expense.id;
        else errors.push(`${input.title}: ${d?.err || d?.expenseCreate?.userErrors?.[0]?.message || 'failed'}`);
        await new Promise((r) => setTimeout(r, 250));
      }
      for (const [k, ex] of Object.entries(existing)) {
        if (!(k in out) && id(ex)) await jobberQuery(`mutation($id: EncodedId!) { expenseDelete(expenseId: $id) { userErrors { message } } }`, { id: ex }).catch(() => {});
      }
      return res.json({ expenseIds: out, errors });
    }
    if (Array.isArray(b.removeIds)) {
      // Plus every Hub-made expense on the job (in case a link was lost).
      if (id(b.jobId)) {
        const onJob = await jobberQuery(`{ job(id: "${b.jobId}") { expenses(first: 100) { nodes { id description } } } }`).then((x) => x.job?.expenses?.nodes || []).catch(() => []);
        onJob.filter((e) => String(e.description || '').includes('from the Hub (Christmas Lights)')).forEach((e) => { if (!b.removeIds.includes(e.id)) b.removeIds.push(e.id); });
      }
      for (const ex of b.removeIds.filter(id).slice(0, 60)) await jobberQuery(`mutation($id: EncodedId!) { expenseDelete(expenseId: $id) { userErrors { message } } }`, { id: ex }).catch(() => {});
      return res.json({ ok: true });
    }
    if (b.remove) {
      if (!id(b.expenseId)) return res.status(400).json({ error: 'expenseId required' });
      const d = await jobberQuery(`mutation($id: EncodedId!) { expenseDelete(expenseId: $id) { userErrors { message } } }`, { id: b.expenseId });
      const ue = d.expenseDelete?.userErrors || [];
      return ue.length ? res.status(400).json({ error: ue[0].message }) : res.json({ ok: true });
    }
    if (!id(b.jobId) || !(Number(b.total) >= 0)) return res.status(400).json({ error: 'jobId and total required' });
    const input = { title: 'Christmas lights materials', description: String(b.description || '').slice(0, 4000), total: Math.round(Number(b.total) * 100) / 100, date: b.date || new Date().toISOString() };
    if (id(b.expenseId)) {
      const d = await jobberQuery(`mutation($id: EncodedId!, $input: ExpenseEditInput!) { expenseEdit(expenseId: $id, input: $input) { expense { id } userErrors { message } } }`, { id: b.expenseId, input });
      const ue = d.expenseEdit?.userErrors || [];
      if (!ue.length) return res.json({ expenseId: d.expenseEdit.expense.id });
      // Deleted in Jobber? Make a new one below.
    }
    const d = await jobberQuery(`mutation($input: ExpenseCreateInput!) { expenseCreate(input: $input) { expense { id } userErrors { message } } }`, { input: { ...input, linkedJobId: b.jobId } });
    const ue = d.expenseCreate?.userErrors || [];
    if (ue.length) return res.status(400).json({ error: ue[0].message });
    return res.json({ expenseId: d.expenseCreate.expense.id });
  } catch (err) {
    if (String(err.message).includes('Throttled')) return res.status(429).json({ error: 'Jobber needs a moment — try again.', code: 'THROTTLED' });
    return res.status(500).json({ error: err.message });
  }
}

// ── Router ──

// ── Plans: every client we've done a job for, read live from Jobber ──
// One row per client. kind: 'plan' = has a recurring job not archived; 'ended' = had
// recurring jobs, all archived (endedAt = latest close); 'one-time' = one-off jobs only.
// Cancel reasons live in the Hub (app store key planNotes), not here.
// Frequency + money for a recurring job. job.total also counts the quantity-0 helper lines
// ("Real Amount", "Plan") used on fixed-price plans, so price comes from lines with quantity > 0.
// Fixed price: that amount per invoice period → monthly; per visit = monthly ÷ visits a month.
// Visit based: that amount per visit; monthly = per visit × visits a month (weekly 4.33, EOW 2.17).
export function planMoney(j) {
  if (j.jobType !== 'RECURRING') return {};
  const lines = (j.lineItems?.nodes || []).filter((l) => (l.quantity || 0) > 0);
  const price = lines.length ? lines.reduce((n, l) => n + (parseFloat(l.totalPrice) || 0), 0) : parseFloat(j.total) || 0;
  const vis = (j.visitSchedule?.recurrenceSchedule?.friendly || '').toLowerCase();
  const inv = (j.invoiceSchedule?.scheduleSummary || '').toLowerCase();
  const wk = vis.startsWith('weekly') ? 1 : +(vis.match(/every (\d+) weeks/)?.[1] || 0);
  const mo = vis.startsWith('monthly') ? 1 : +(vis.match(/every (\d+) months/)?.[1] || 0);
  const visitsPerMonth = wk ? 52 / wk / 12 : mo ? 1 / mo : 0;
  const freq = wk === 1 ? 'Weekly' : wk === 2 ? 'EOW' : wk ? `Every ${wk} wks` : mo === 1 ? 'Monthly' : mo ? `Every ${mo} mos` : '';
  const r2 = (n) => Math.round(n * 100) / 100;
  let monthly = null, perVisit = null;
  if (j.billingType === 'FIXED_PRICE') {
    const months = inv.startsWith('monthly') ? 1 : inv.startsWith('yearly') ? 12 : +(inv.match(/every (\d+) months/)?.[1] || 0);
    if (months && price) { monthly = r2(price / months); perVisit = visitsPerMonth ? r2(monthly / visitsPerMonth) : null; }
  } else if (price) {
    perVisit = r2(price);
    monthly = visitsPerMonth ? r2(price * visitsPerMonth) : null;
  }
  return { freq, monthly, perVisit };
}

let plansCache = null; // { data, time }
const PLANS_TTL = 10 * 60 * 1000;
const fmtAddress = (a) => {
  if (!a?.street1) return '';
  const street = [a.street1, a.street2].filter(Boolean).join(' ');
  return [street, a.city, [a.province, a.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
};

async function handlePlans(req, res) {
  if (plansCache && req.query.refresh !== '1' && Date.now() - plansCache.time < PLANS_TTL) return res.json(plansCache.data);
  try {
    const jobs = [];
    let after = null;
    do {
      const data = await jobberQuery(`{ jobs(first: 50${after ? `, after: "${after}"` : ''}, ) { nodes { id jobNumber title jobType jobStatus startAt endAt completedAt total billingType lineItems(first: 10) { nodes { quantity totalPrice } } client { id name emails { address primary } phones { number primary } billingAddress { street1 street2 city province postalCode } } property { address { street1 street2 city province postalCode } } visitSchedule { recurrenceSchedule { friendly } } invoiceSchedule { scheduleSummary } } pageInfo { hasNextPage endCursor } } }`);
      jobs.push(...(data.jobs?.nodes || []));
      after = data.jobs?.pageInfo?.hasNextPage ? data.jobs.pageInfo.endCursor : null;
      if (after) await new Promise((r) => setTimeout(r, 300));
    } while (after && jobs.length < 2000);

    // Jobber's job list lags behind its single-job records, so a job reopened a few minutes ago
    // can still list as archived. Re-check recently closed recurring jobs one by one (aliased in one query).
    const weekAgo = Date.now() - 7 * 864e5;
    const recent = jobs.filter((j) => j.jobType === 'RECURRING' && j.jobStatus === 'archived' && j.completedAt && new Date(j.completedAt).getTime() > weekAgo).slice(0, 40);
    if (recent.length) {
      try {
        const q = recent.map((j, i) => `j${i}: job(id: "${j.id}") { jobStatus completedAt }`).join(' ');
        const live = await jobberQuery(`{ ${q} }`);
        recent.forEach((j, i) => { const l = live[`j${i}`]; if (l) { j.jobStatus = l.jobStatus; j.completedAt = l.completedAt; } });
      } catch (e) { console.warn('[plans] recheck of recently closed jobs failed:', e.message); }
    }

    const byClient = {};
    for (const j of jobs) {
      const c = j.client; if (!c?.id) continue;
      const row = byClient[c.id] || (byClient[c.id] = {
        clientId: c.id, name: c.name || 'Unknown',
        phone: (c.phones?.find((p) => p.primary) || c.phones?.[0])?.number || '',
        email: (c.emails?.find((e) => e.primary) || c.emails?.[0])?.address || '',
        billing: fmtAddress(c.billingAddress),
        jobs: [],
      });
      row.jobs.push({
        id: j.id, jobNumber: j.jobNumber, title: j.title || '', recurring: j.jobType === 'RECURRING', status: j.jobStatus,
        active: j.jobStatus !== 'archived', startAt: j.startAt, endAt: j.endAt, closedAt: j.jobStatus === 'archived' ? j.completedAt : null,
        total: j.total, billingType: j.billingType, address: fmtAddress(j.property?.address),
        visits: j.visitSchedule?.recurrenceSchedule?.friendly || '', invoices: j.invoiceSchedule?.scheduleSummary || '',
        ...planMoney(j),
      });
    }
    const clients = Object.values(byClient).map((r) => {
      r.jobs.sort((a, b) => (b.startAt || '').localeCompare(a.startAt || ''));
      // Service address from their latest job; billing address if no job has a property
      r.address = r.jobs.find((j) => j.address)?.address || r.billing || '';
      delete r.billing;
      const rec = r.jobs.filter((j) => j.recurring);
      r.kind = rec.some((j) => j.active) ? 'plan' : rec.length ? 'ended' : 'one-time';
      r.endedAt = r.kind === 'ended' ? rec.map((j) => j.closedAt || j.endAt || '').sort().pop() || null : null;
      // Last time we did anything for them: latest close, else latest scheduled end that's passed.
      const now = new Date().toISOString();
      r.lastService = r.jobs.map((j) => j.closedAt || (j.endAt && j.endAt < now ? j.endAt : '') || '').sort().pop() || null;
      return r;
    }).sort((a, b) => a.name.localeCompare(b.name));
    const data = { clients, updatedAt: new Date().toISOString() };
    plansCache = { data, time: Date.now() };
    return res.json(data);
  } catch (err) {
    if (plansCache) return res.json(plansCache.data);
    if (err.code === 'JOBBER_DISCONNECTED') return res.status(401).json({ error: err.message, code: 'JOBBER_DISCONNECTED' });
    if (err.message?.includes('Throttled')) return res.status(429).json({ error: 'Jobber needs a moment — try again.', code: 'THROTTLED' });
    return res.status(500).json({ error: err.message });
  }
}


// ── Lights: client said yes on the Present page → build the Jobber quote ──
// POST /api/jobber-data?action=lights-quote-create  { id, years, addonIds }   (owner login required)
// Prices come from the saved quote (lq-meta) + its add-ons (lq-ba), never from the browser.
// Mirrors Jude's hand-built lights quotes: Roofline C9 line, add-on lines, $0 term line,
// % discount for multi-year, 50% deposit, the usual terms message. Created as a DRAFT —
// Jude reviews it in Jobber and sends it / collects the deposit from there.
const LQ_PRODUCTS = {
  roofline: 'Z2lkOi8vSm9iYmVyL1Byb2R1Y3RPclNlcnZpY2UvNTUwNDIxOTY=',
  trees: 'Z2lkOi8vSm9iYmVyL1Byb2R1Y3RPclNlcnZpY2UvNTUwNDIxOTk=',
  bushes: 'Z2lkOi8vSm9iYmVyL1Byb2R1Y3RPclNlcnZpY2UvNTUwNDIyMDA=',
  wreath24: 'Z2lkOi8vSm9iYmVyL1Byb2R1Y3RPclNlcnZpY2UvNTUwNDIyMDU=',
  garland: 'Z2lkOi8vSm9iYmVyL1Byb2R1Y3RPclNlcnZpY2UvNTUwNDIyMDQ=',
  term1: 'Z2lkOi8vSm9iYmVyL1Byb2R1Y3RPclNlcnZpY2UvNTUwNDIyMDk=',
  term2: 'Z2lkOi8vSm9iYmVyL1Byb2R1Y3RPclNlcnZpY2UvNTUwNDIyMTA=',
  term3: 'Z2lkOi8vSm9iYmVyL1Byb2R1Y3RPclNlcnZpY2UvNTUwNDIyMTE=',
};
const LQ_OFF = { 1: 0, 2: 5, 3: 10 }; // must match PLANS on the Present page
const LQ_COLORS = { warm: 'Warm White', cool: 'Pure White', multi: 'Multicolor', redwhite: 'Red & White', redgreen: 'Red & Green' };
const LQ_MESSAGE = `Ownership - Single installation & renewal - Unless explicitly stated to be a purchase agreement, all materials are leased to the client from the installation date until the scheduled date of removal.

Ownership - Multi-year agreement - Unless explicitly stated to be a purchase agreement, all materials are leased to the client from the time on initial installation until the removal during the final year of the agreed upon multi-year term.

Payment terms - Single installation & renewal - A 50% deposit is required upon approval of this quote before installation can be scheduled. The final deposit of the remaining 50% is due at the time of installation unless payment plan terms approved by client and Hey Jude's.

Payment terms - Multi-year agreement - The total balance for the multi-year agreement will be paid in equal bi-annual installments over the period of the agreement. The first installment is due upon signing this agreement with the following amounts and cadence referred to in the above section of this agreement. During the agreement term, you may choose to cancel your subscription to services early, provided that, we will not provide any refunds and you will promptly pay any discounts received to date from the benefits of having signed a multi-year agreement.

Payments are to be made by credit card unless agreed upon in writing by Hey Jude's. When paying by credit card, you authorize us to charge your credit card or bank account for all fees payable during the agreement term. You further authorize us to use a third party to process payments, and consent to the disclosure of your payment information to such third party.

Removal - Removal dates will be scheduled upon completion of installation. Pending unavoidable weather conditions, all displays will be removed prior to February 1st.

Maintenance - Maintenance of the display is included in the service provided for the duration of the installation.

Use of Media - Your display will look extraordinary, and deserves to be shared. By accepting this contract, you agree that we may capture, store and use images and video of your property's display on our website and social media without compromising the privacy of your home.

Property Access - You agree to provide unmitigated access at the scheduled work times to ensure we have reasonable access to the working area needed to install and remove the display.

Disclaimers - We will provide all materials and equipment necessary to complete the display. No other person(s) are permitted to make alterations or repairs without prior written consent from Hey Jude's. Any alterations or repairs made by other person(s) will void the inclusive maintenance warranty and any further replacements or repairs performed by Hey Jude's will be considered additional billable services. In certain instances, we may use tape, hot glue, or staples to mount components of the display. These methods are used on an as-needed basis. By accepting the quote, you agree to these installation methods.`;

function lqTermText(years, startYear) {
  const ys = Array.from({ length: years }, (_, i) => startYear + i);
  const words = { 2: 'two (2)', 3: 'three (3)' };
  const pay = [];
  ys.forEach((y, i) => { if (i > 0) pay.push(`August 1, ${y}`); pay.push(`${y} installation date`); });
  const lines = ['Due upon quote acceptance', ...pay];
  return [
    `- The display described above will be installed, maintained, removed and stored for ${words[years]} seasons: ${ys.slice(0, -1).join(', ')} and ${ys[ys.length - 1]}. Changes to the display may be made in ${years === 2 ? 'the second season' : 'later seasons'}, but may be billed as additional work outside the scope of this quote.`,
    `- A ${LQ_OFF[years]}% discount is applied to each season's price, and pricing is locked for ${years === 2 ? 'both' : 'all three'} seasons.`,
    `- All lights and equipment remain the property of Hey Jude's.`,
    `- If the agreement is cancelled before the end of the term, the discount received on completed seasons becomes due.`,
    `- The total agreement is paid in ${lines.length} equal installments:`,
    ...lines.map((l, i) => `${i + 1}${['st', 'nd', 'rd'][i] || 'th'} payment: ${l}`),
  ].join('\n');
}

// Builds the Jobber quote line items for a lights quote. Shared by the real quote (quoteCreate)
// and the Present-step preview, so the preview always says exactly what the quote will say.
// Wire color as drawn on the plan: each roof line's own color (Mark up), else the quote's default.
// Weighted by feet, same as the materials list. Mixed → "Black & White".
function lqWireLabel(meta, angles) {
  const ft = { black: 0, white: 0, green: 0 };
  for (const a of angles || []) for (const l of a.lines || []) {
    const c = String(l.color || meta.wire || 'white').toLowerCase();
    const k = /black/.test(c) ? 'black' : /green/.test(c) ? 'green' : 'white';
    ft[k] += Number(l.feet) || 1;
  }
  const used = Object.entries(ft).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).map(([k]) => k[0].toUpperCase() + k.slice(1));
  if (used.length) return used.join(' & ');
  return /black/i.test(String(meta.wire || '')) ? 'Black' : /green/i.test(String(meta.wire || '')) ? 'Green' : 'White';
}

function buildLqQuote({ meta, ba, base, years, addonIds, angles }) {
  const baRow = { value: ba };
  const wanted = new Set(Array.isArray(addonIds) ? addonIds.map(String) : []);
  const addons = (baRow?.value?.addons || []).filter((a) => Number(a.price) > 0 && wanted.has(String(a.id)));
  const perks = (baRow?.value?.perks || []).filter((p) => p.title);
  // Offers (same math as the Present page): % is of roofline + kept add-ons.
  const full = base + addons.reduce((t, a) => t + Number(a.price), 0);
  const offers = (baRow?.value?.offers || []).filter((o) => o.on !== false && Number(o.amount) > 0)
    .map((o) => ({ label: o.label || 'Special offer', free: o.kind === 'free', value: Number(o.amount), off: o.kind === 'free' ? 0 : Math.round((o.kind === '%' ? full * Number(o.amount) / 100 : Number(o.amount)) * 100) / 100, when: o.when }));

  const color = LQ_COLORS[meta.style] || (meta.customColor ? String(meta.customColor) : 'Warm White');
  const wire = lqWireLabel(meta, angles);
  const startYear = Number(String(meta.installDate || '').slice(0, 4)) || new Date().getFullYear();
  const lineItems = [
    {
      name: 'Roofline C9 Lighting', productOrServiceId: LQ_PRODUCTS.roofline, saveToProductsAndServices: false, quantity: 1, unitPrice: base,
      description: ['- Commercial-grade, energy-efficient LED C9 lights, custom-cut to fit your home', '- Lighting covers: All shown in your design', `- Bulb color: ${color}`, `- Wire color: ${wire}`, '- Includes installation, in-season maintenance, takedown and storage'].join('\n'),
    },
    ...addons.map((a) => {
      const what = `${a.id} ${a.label}`;
      const kind = /wreath/i.test(what) ? 'wreath24' : /garland/i.test(what) ? 'garland' : /bush|shrub/i.test(what) ? 'bushes' : /tree/i.test(what) ? 'trees' : '';
      const NAMES = { trees: 'Deciduous Tree Lighting', bushes: 'Bush & Shrub Lighting', wreath24: 'Lit Wreath - 24 in', garland: 'Lit Garland' };
      const DESC = {
        trees: ['- Commercial-grade, energy-efficient LED mini lights, 24 ft per strand', `- Wrapping includes: ${a.sub || 'tight spiral trunk wrap'}`, `- Bulb color: ${color}`, '- Includes installation, in-season maintenance, takedown and storage'],
        bushes: ['- Commercial-grade, energy-efficient LED mini lights, 24 ft per strand', `- ${a.sub || 'Net-style wrap for even, full coverage across each bush'}`, `- Bulb color: ${color}`, '- Includes installation, in-season maintenance, takedown and storage'],
        wreath24: ['- 24-inch commercial-grade evergreen Christmas wreath, pre-lit with LED lights', `- ${a.sub || 'Light color: ' + color}`, '- Professionally hung without damage to your siding or stucco', '- Includes installation, in-season maintenance, takedown and storage'],
        garland: ['- Commercial-grade 14-inch evergreen garland, pre-lit with LED mini lights', `- ${a.sub || 'Wrapped on the railing or doorway'}`, '- Includes installation, in-season maintenance, takedown and storage'],
      };
      return {
        name: kind ? `${NAMES[kind]} — ${a.label}` : a.label,
        ...(kind ? { productOrServiceId: LQ_PRODUCTS[kind] } : {}),
        saveToProductsAndServices: false, quantity: 1, unitPrice: Number(a.price),
        description: (DESC[kind] || [`- ${a.sub || 'Outlined in lights'}`, `- Bulb color: ${color}`, '- Includes installation, in-season maintenance, takedown and storage']).join('\n'),
      };
    }),
    ...perks.map((p) => ({ name: (() => { const t = String(p.title).replace(/^[^\w"]+\s*/u, ''); return /^free\b/i.test(t) ? `🎁 ${t}` : `🎁 ${t} — FREE`; })(), description: p.sub || '', saveToProductsAndServices: false, quantity: 1, unitPrice: 0 })),
    ...offers.map((o) => ({ name: `🎁 ${o.label}${o.free ? ' — FREE' : ''}`, description: [o.free ? `A $${o.value} value, included free` : '', o.when === 'today' ? 'Offer good when booked today' : ''].filter(Boolean).join('\n'), saveToProductsAndServices: false, quantity: 1, unitPrice: o.free ? 0 : -o.off })),
    years > 1
      ? { name: `Holiday Display - ${years} Season term`, productOrServiceId: LQ_PRODUCTS[`term${years}`], saveToProductsAndServices: false, quantity: 1, unitPrice: 0, description: lqTermText(years, startYear) }
      : { name: 'Holiday Display - Seasonal Rental', productOrServiceId: LQ_PRODUCTS.term1, saveToProductsAndServices: false, quantity: 1, unitPrice: 0 },
  ];

  return { lineItems, addons, offers };
}

export async function handleLightsQuotePreview(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const db = getSupabaseAdmin();
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const { data: who } = token ? await db.auth.getUser(token) : { data: null };
  if (who?.user?.user_metadata?.role !== 'owner') return res.status(401).json({ error: 'Log in to the Hub as the owner first.' });
  const { id, years: y, addonIds } = req.body || {};
  const years = [1, 2, 3].includes(Number(y)) ? Number(y) : 1;
  if (!/^[\w-]+$/.test(String(id || ''))) return res.status(400).json({ error: 'Bad quote id' });
  const [{ data: metaRow }, { data: baRow }, { data: dataRow }] = await Promise.all([
    db.from('app_state').select('value').eq('key', `lq-meta:${id}`).maybeSingle(),
    db.from('app_state').select('value').eq('key', `lq-ba:${id}`).maybeSingle(),
    db.from('app_state').select('value').eq('key', `lq-data:${id}`).maybeSingle(),
  ]);
  const meta = metaRow?.value;
  if (!meta) return res.status(404).json({ error: 'Save the quote first (pick the client).' });
  const roof = Number(meta.quoted) || Number(meta.total) || 0;
  const base = roof + Math.max(0, Number(baRow?.value?.adjust) || 0);
  const { lineItems } = buildLqQuote({ meta, ba: baRow?.value, base, years, addonIds, angles: dataRow?.value?.angles });
  const subtotal = lineItems.reduce((t, li) => t + (Number(li.unitPrice) || 0) * (Number(li.quantity) || 1), 0);
  const discountRate = LQ_OFF[years] || 0;
  const discount = Math.round(subtotal * discountRate) / 100;
  const total = Math.round((subtotal - discount) * 100) / 100;
  const allAddons = (baRow?.value?.addons || []).filter((a) => Number(a.price) > 0).map((a) => ({ id: String(a.id), label: a.label, price: Number(a.price) }));
  return res.json({
    title: '🎄✨Christmas Magic Makeover',
    lineItems: lineItems.map((li) => ({ name: li.name, description: li.description || '', quantity: li.quantity, unitPrice: li.unitPrice })),
    subtotal, discountRate, discount, total, depositRate: 50, deposit: Math.round(total * 50) / 100,
    message: LQ_MESSAGE, years, availableAddons: allAddons, priced: roof > 0,
  });
}

async function handleLightsQuoteCreate(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const db = getSupabaseAdmin();
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const { data: who } = token ? await db.auth.getUser(token) : { data: null };
  if (who?.user?.user_metadata?.role !== 'owner') return res.status(401).json({ error: 'Log in to the Hub as the owner first.' });

  const { id, years: y, addonIds } = req.body || {};
  const years = [1, 2, 3].includes(Number(y)) ? Number(y) : 1;
  if (!/^[\w-]+$/.test(String(id || ''))) return res.status(400).json({ error: 'Bad quote id' });

  // One Jobber quote per presentation — tapping again just reopens it.
  const { data: done } = await db.from('app_state').select('value').eq('key', `lq-jq:${id}`).maybeSingle();
  if (done?.value?.quoteId) return res.json({ ...done.value, existing: true });

  const [{ data: metaRow }, { data: baRow }, { data: dataRow }] = await Promise.all([
    db.from('app_state').select('value, org_id').eq('key', `lq-meta:${id}`).maybeSingle(),
    db.from('app_state').select('value').eq('key', `lq-ba:${id}`).maybeSingle(),
    db.from('app_state').select('value').eq('key', `lq-data:${id}`).maybeSingle(),
  ]);
  const meta = metaRow?.value;
  if (!meta) return res.status(404).json({ error: 'Quote not found' });
  const roof = Number(meta.quoted) || Number(meta.total) || 0;
  if (!(roof > 0)) return res.status(400).json({ error: 'This quote has no price yet.' });
  const base = roof + Math.max(0, Number(baRow?.value?.adjust) || 0); // price bump folds into the roofline line
  const clientId = meta.clientInfo?.id;
  if (!clientId) return res.status(400).json({ error: 'No Jobber client on this quote — pick the client in the Quoter first.' });

  // Their property (match the quote's address, else their first one) + their open lights request, if any.
  const c = await jobberQuery(`query($id: EncodedId!) { client(id: $id) { properties { id address { street } } requests(first: 10) { nodes { id title requestStatus } } } }`, { id: clientId });
  const props = c?.client?.properties || [];
  const street = String(meta.clientInfo?.address || '').toLowerCase().split(',')[0].trim();
  const prop = props.find((p) => street && String(p.address?.street || '').toLowerCase().includes(street)) || props[0];
  if (!prop) return res.status(400).json({ error: 'That Jobber client has no property — add their address in Jobber first.' });
  const req0 = (c.client.requests?.nodes || []).find((r) => /light|christmas|holiday/i.test(r.title || '') && !/converted|archived/i.test(r.requestStatus || ''));

  const { lineItems, addons } = buildLqQuote({ meta, ba: baRow?.value, base, years, addonIds, angles: dataRow?.value?.angles });
  const attributes = {
    clientId, propertyId: prop.id, ...(req0 ? { requestId: req0.id } : {}),
    title: '🎄✨Christmas Magic Makeover',
    message: LQ_MESSAGE,
    lineItems,
    deposit: { rate: 50, type: 'Percent' },
    ...(LQ_OFF[years] ? { discount: { rate: LQ_OFF[years], type: 'Percent' } } : {}),
  };
  const r = await jobberQuery(`mutation($a: QuoteCreateAttributes!) { quoteCreate(attributes: $a) { quote { id quoteNumber jobberWebUri amounts { subtotal discountAmount total depositAmount } } userErrors { message path } } }`, { a: attributes });
  const errs = r?.quoteCreate?.userErrors || [];
  const q = r?.quoteCreate?.quote;
  if (!q) return res.status(400).json({ error: errs.map((e) => e.message).join('; ') || 'Jobber did not create the quote' });

  const out = { quoteId: q.id, quoteNumber: q.quoteNumber, url: q.jobberWebUri, total: q.amounts?.total, deposit: q.amounts?.depositAmount, years, addons: addons.map((a) => a.id), at: new Date().toISOString() };
  await db.from('app_state').upsert({ key: `lq-jq:${id}`, value: out, org_id: metaRow.org_id, updated_at: out.at }, { onConflict: 'key' });
  return res.json(out);
}

export default async function handler(req, res) {
  try {
    const action = req.query.action;
    if (action === 'status') {
      const status = await jobberStatus();
      return res.json(status);
    }
    if (action === 'refresh') {
      const result = await forceRefresh();
      return res.status(result.ok ? 200 : 400).json(result);
    }
    if (action === 'crew-status') return handleCrewStatus(req, res);
    if (action === 'clients') return handleClientSearch(req, res);
    if (action === 'all-clients') return handleAllClients(req, res);
    if (action === 'labor') return handleLaborData(req, res);
    if (action === 'today-visits') return handleTodayVisits(req, res);
    if (action === 'open-quotes') return handleOpenQuotes(req, res);
    if (action === 'lights-quotes') return handleLightsQuotes(req, res);
    if (action === 'new-requests') return handleNewRequests(req, res);
    if (action === 'lights-requests') return handleLightsRequests(req, res);
    if (action === 'recent-jobs') return handleRecentJobs(req, res);
    if (action === 'requests-history') return handleRequestsHistory(req, res);
    if (action === 'quotes-history') return handleQuotesHistory(req, res);
    if (action === 'booked-history') return handleBookedHistory(req, res);
    if (action === 'backfill-job-dates') return handleBackfillJobDates(req, res);
    if (action === 'month-visits') return handleMonthVisits(req, res);
    if (action === 'hub-sync') return handleHubSync(req, res);
    if (action === 'ytd-revenue') return handleYTDRevenue(req, res);
    if (action === 'recurring-summary') return handleRecurringSummary(req, res);
    if (action === 'plans') return handlePlans(req, res);
    if (action === 'lights-job-summary') return handleLightsJobSummary(req, res);
    if (action === 'lights-job-expense') return handleLightsJobExpense(req, res);
    if (action === 'lights-quote-create') return handleLightsQuoteCreate(req, res);
    if (action === 'lights-quote-preview') return handleLightsQuotePreview(req, res);
    return res.status(400).json({ error: 'action param required: status | crew-status | clients | labor | ytd-revenue' });
  } catch (err) {
    console.error('[Jobber Data] Error:', err.message);
    if (err instanceof JobberDisconnectedError || err.code === 'JOBBER_DISCONNECTED') {
      return res.status(401).json({ error: err.message, code: 'JOBBER_DISCONNECTED' });
    }
    return res.status(500).json({ error: err.message });
  }
}
