import { jobberQuery, jobberStatus, JobberDisconnectedError } from '../lib/jobberClient.js';

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
  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await jobberQuery(`{ visits(first: 100${after}, filter: { startAt: { after: "${startISO}", before: "${endISO}" } }) { nodes { id title completedAt startAt endAt job { id jobNumber total client { firstName lastName } } } pageInfo { hasNextPage endCursor } } }`);
    allVisits.push(...(data.visits?.nodes || []));
    hasNext = data.visits?.pageInfo?.hasNextPage || false;
    cursor = data.visits?.pageInfo?.endCursor || null;
    if (allVisits.length > 500) break;
  }
  return allVisits.filter(v => { const d = (v.completedAt || v.startAt || '').split('T')[0]; return d >= start && d <= end; });
}

async function fetchTimesheets(start, end) {
  const startISO = new Date(start + 'T00:00:00').toISOString();
  const endPlusOne = new Date(end + 'T00:00:00');
  endPlusOne.setDate(endPlusOne.getDate() + 1);
  const endISO = endPlusOne.toISOString();

  const all = [];
  let cursor = null, hasNext = true;
  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await jobberQuery(`{ timeSheetEntries(first: 100${after}, filter: { startAt: { after: "${startISO}", before: "${endISO}" } }) { nodes { id startAt endAt duration labourRate label user { id name { full } } job { id } } pageInfo { hasNextPage endCursor } } }`);
    all.push(...(data.timeSheetEntries?.nodes || []));
    hasNext = data.timeSheetEntries?.pageInfo?.hasNextPage || false;
    cursor = data.timeSheetEntries?.pageInfo?.endCursor || null;
    if (all.length > 1000) break;
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
  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await jobberQuery(`{ expenses(first: 100${after}, filter: { date: { after: "${startISO}", before: "${endISO}" } }) { nodes { id title total date description linkedJob { id jobNumber } paidBy { name { full } } } pageInfo { hasNextPage endCursor } } }`);
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

// Labor data cache
const laborCache = {};
const LABOR_CACHE_TTL = 5 * 60 * 1000;

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

async function handleLaborData(req, res) {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end required' });

  const cacheKey = `${start}|${end}`;
  const cached = laborCache[cacheKey];
  if (cached && Date.now() - cached.time < LABOR_CACHE_TTL) {
    return res.json(cached.data);
  }

  let visits, timesheets, expenses;
  try {
    visits = await fetchVisits(start, end);
    timesheets = await fetchTimesheets(start, end);
    expenses = await fetchExpenses(start, end);
  } catch (err) {
    console.error('[Labor] Fetch error:', err.message);
    if (cached) {
      console.log('[Labor] Serving stale cache due to error');
      return res.json(cached.data);
    }
    if (err.message?.includes('Throttled')) {
      return res.status(429).json({ error: 'Jobber needs a moment — tap refresh.', code: 'THROTTLED' });
    }
    if (err.code === 'JOBBER_DISCONNECTED') {
      return res.status(401).json({ error: err.message, code: 'JOBBER_DISCONNECTED' });
    }
    return res.status(500).json({ error: err.message });
  }

  const grouped = {};
  const cur = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  while (cur <= endDate) { const ds = cur.toISOString().split('T')[0]; grouped[ds] = { visits: [], revenue: 0, expenses: { total: 0, items: [] }, labor: { totalHours: 0, totalCost: 0, byPerson: {} } }; cur.setDate(cur.getDate() + 1); }

  // ── Per-visit line item totals (the actual price for THAT visit) ──
  // Throttled separate fetch to avoid Jobber rate limiting.
  const visitLineItemTotals = {};
  for (const v of visits) {
    if (!v.id) continue;
    visitLineItemTotals[v.id] = await fetchVisitLineItemsTotal(v.id);
    await new Promise((r) => setTimeout(r, 350));
  }

  // ── Per-job expenses (catches expenses whose own date falls outside the window) ──
  const uniqueJobIdsForExpenses = [...new Set(visits.map(v => v.job?.id).filter(Boolean))];
  const seenExpenseIds = new Set(expenses.map(e => e.id));
  for (const jobId of uniqueJobIdsForExpenses) {
    const jobExps = await fetchJobExpenses(jobId);
    for (const e of jobExps) {
      if (seenExpenseIds.has(e.id)) continue;
      // Anchor to a date inside the queried window so it gets attributed.
      // Prefer the expense's own date if it's in range, else use the first visit date for this job.
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
    const visitObj = { id: visit.id, title: visit.title, completedAt: visit.completedAt, startAt: visit.startAt, endAt: visit.endAt, visitDuration, jobId, jobNumber: visit.job?.jobNumber, jobTotal: rawTotal, visitTotal: rawTotal, client: visit.job?.client ? `${visit.job.client.firstName || ''} ${visit.job.client.lastName || ''}`.trim() : 'Unknown', labor: { totalHours: 0, totalCost: 0, byPerson: {} } };
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

    // Get all timesheets and expenses for this job
    const jobTs = fullTsByJob[jobId] || [];
    const jobExp = fullExpByJob[jobId] || [];
    const totalJobExpenses = jobExp.reduce((s, e) => s + (parseFloat(e.total) || 0), 0);

    // Group timesheets by date
    const hoursByDate = {};
    const costByDate = {};
    const personByDate = {};
    for (const t of jobTs) {
      const d = (t.startAt || '').split('T')[0];
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
    }

    const totalJobHours = Object.values(hoursByDate).reduce((s, h) => s + h, 0);

    // Create a visit entry for each in-range date that has hours
    // If job has multiple work days, it's likely recurring — each day gets full jobTotal
    // If only 1 work day, it's a one-off — gets full jobTotal too
    const workDays = Object.keys(hoursByDate).length;
    const isRecurring = workDays > 1; // multiple days = recurring visits, each gets full price

    for (const [dateStr, dayHours] of Object.entries(hoursByDate)) {
      if (!grouped[dateStr]) continue;
      const proportion = totalJobHours > 0 ? dayHours / totalJobHours : 0;
      const visitRevenue = isRecurring ? jobTotal : jobTotal * proportion;
      const visitExpenses = isRecurring ? totalJobExpenses / workDays : totalJobExpenses * proportion;

      grouped[dateStr].visits.push({
        id: `${jobId}-${dateStr}`,
        title,
        completedAt: dateStr,
        jobId,
        jobNumber,
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
  return res.json(grouped);
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

// ── Router ──

export default async function handler(req, res) {
  try {
    const action = req.query.action;
    if (action === 'status') {
      const status = await jobberStatus();
      return res.json(status);
    }
    if (action === 'crew-status') return handleCrewStatus(req, res);
    if (action === 'clients') return handleClientSearch(req, res);
    if (action === 'all-clients') return handleAllClients(req, res);
    if (action === 'labor') return handleLaborData(req, res);
    if (action === 'ytd-revenue') return handleYTDRevenue(req, res);
    return res.status(400).json({ error: 'action param required: status | crew-status | clients | labor | ytd-revenue' });
  } catch (err) {
    console.error('[Jobber Data] Error:', err.message);
    if (err instanceof JobberDisconnectedError || err.code === 'JOBBER_DISCONNECTED') {
      return res.status(401).json({ error: err.message, code: 'JOBBER_DISCONNECTED' });
    }
    return res.status(500).json({ error: err.message });
  }
}
