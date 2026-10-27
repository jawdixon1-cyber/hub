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
    const data = await jobberQuery(`{ timeSheetEntries(first: 25${after}, filter: { startAt: { after: "${startISO}", before: "${endISO}" } }) { nodes { id startAt endAt duration labourRate label user { id name { full } } job { id } } pageInfo { hasNextPage endCursor } } }`);
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
  const cacheKey = `v3|${start}|${end}|${skipLineItems ? 'nopv' : 'full'}|${skipJobExpenses ? 'noje' : 'je'}`; // v2: one-off jobs split by hours; v3: billing type + schedules
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
    for (const v of visits) {
      if (!v.id) continue;
      visitLineItemTotals[v.id] = await fetchVisitLineItemsTotal(v.id);
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  // ── Per-job expenses (catches expenses whose own date falls outside the window) ──
  // Skip when the caller just needs job-level totals — this loop makes 1 API call per unique
  // job, which is what most often hits Jobber's rate limit.
  if (!skipJobExpenses) {
    const uniqueJobIdsForExpenses = [...new Set(visits.map(v => v.job?.id).filter(Boolean))];
    const seenExpenseIds = new Set(expenses.map(e => e.id));
    for (const jobId of uniqueJobIdsForExpenses) {
      const jobExps = await fetchJobExpenses(jobId);
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
      await new Promise((r) => setTimeout(r, 250));
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
    else { grouped[dateStr].labor.generalHours = (grouped[dateStr].labor.generalHours || 0) + hours; grouped[dateStr].labor.generalCost = (grouped[dateStr].labor.generalCost || 0) + cost; }
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
      const { error: visitErr } = await supabase
        .from('hub_visits').upsert(visitRow, { onConflict: 'source,source_id' });
      if (visitErr) throw new Error(`hub_visits upsert failed for ${v.id}: ${visitErr.message}`);
      totalVisits++;
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

// ── Router ──

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
    if (action === 'new-requests') return handleNewRequests(req, res);
    if (action === 'requests-history') return handleRequestsHistory(req, res);
    if (action === 'quotes-history') return handleQuotesHistory(req, res);
    if (action === 'booked-history') return handleBookedHistory(req, res);
    if (action === 'backfill-job-dates') return handleBackfillJobDates(req, res);
    if (action === 'month-visits') return handleMonthVisits(req, res);
    if (action === 'hub-sync') return handleHubSync(req, res);
    if (action === 'ytd-revenue') return handleYTDRevenue(req, res);
    if (action === 'recurring-summary') return handleRecurringSummary(req, res);
    return res.status(400).json({ error: 'action param required: status | crew-status | clients | labor | ytd-revenue' });
  } catch (err) {
    console.error('[Jobber Data] Error:', err.message);
    if (err instanceof JobberDisconnectedError || err.code === 'JOBBER_DISCONNECTED') {
      return res.status(401).json({ error: err.message, code: 'JOBBER_DISCONNECTED' });
    }
    return res.status(500).json({ error: err.message });
  }
}
