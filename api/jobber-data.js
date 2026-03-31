import { jobberQuery } from '../lib/jobberClient.js';

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

// ── Labor Data (visits + timesheets) ──

async function fetchVisits(start, end) {
  const startISO = new Date(start + 'T00:00:00').toISOString();
  const endPlusOne = new Date(end + 'T00:00:00');
  endPlusOne.setDate(endPlusOne.getDate() + 1);
  const endISO = endPlusOne.toISOString();

  const allVisits = [];
  let cursor = null, hasNext = true;
  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    let data;
    try {
      data = await jobberQuery(`{ visits(first: 100${after}, filter: { startAt: { after: "${startISO}", before: "${endISO}" } }) { nodes { id title completedAt startAt endAt job { id jobNumber total client { firstName lastName } } } pageInfo { hasNextPage endCursor } } }`);
    } catch {
      data = await jobberQuery(`{ visits(first: 100${after}) { nodes { id title completedAt startAt endAt job { id jobNumber total client { firstName lastName } } } pageInfo { hasNextPage endCursor } } }`);
    }
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

async function handleLaborData(req, res) {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end required' });

  const [visits, timesheets, expenses] = await Promise.all([fetchVisits(start, end), fetchTimesheets(start, end), fetchExpenses(start, end)]);

  const grouped = {};
  const cur = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  while (cur <= endDate) { const ds = cur.toISOString().split('T')[0]; grouped[ds] = { visits: [], revenue: 0, expenses: { total: 0, items: [] }, labor: { totalHours: 0, totalCost: 0, byPerson: {} } }; cur.setDate(cur.getDate() + 1); }

  // ── Collect all visits ──
  const allVisitRefs = []; // { dateStr, visitObj, jobId, rawTotal }
  for (const visit of visits) {
    const dateStr = (visit.completedAt || visit.startAt || '').split('T')[0];
    if (!dateStr || !grouped[dateStr]) continue;
    const rawTotal = parseFloat(visit.job?.total) || 0;
    const jobId = visit.job?.id || null;
    // Compute visit duration from start/end for proportional hour allocation
    let visitDuration = 0;
    if (visit.startAt && visit.endAt) {
      visitDuration = (new Date(visit.endAt) - new Date(visit.startAt)) / 3600000;
      if (visitDuration < 0) visitDuration = 0;
    }
    const visitObj = { id: visit.id, title: visit.title, completedAt: visit.completedAt, startAt: visit.startAt, endAt: visit.endAt, visitDuration, jobId, jobNumber: visit.job?.jobNumber, jobTotal: rawTotal, client: visit.job?.client ? `${visit.job.client.firstName || ''} ${visit.job.client.lastName || ''}`.trim() : 'Unknown', labor: { totalHours: 0, totalCost: 0, byPerson: {} } };
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

  // Jobs from timesheets only (no visits in range) — need to fetch from Jobber
  const timesheetOnlyJobIds = Object.keys(visitsByJob).filter(id => visitsByJob[id].length === 0);
  const BATCH_SIZE = 2;
  for (let i = 0; i < timesheetOnlyJobIds.length; i += BATCH_SIZE) {
    const batch = timesheetOnlyJobIds.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (jobId) => {
      try {
        const data = await jobberQuery(`{ job(id: "${jobId}") { total jobNumber title client { firstName lastName } visits(first: 100) { nodes { id completedAt } } } }`);
        const job = data.job || {};
        const completed = (job.visits?.nodes || []).filter(v => v.completedAt);
        const visitDates = completed.map(v => v.completedAt.split('T')[0]).sort();
        const clientName = job.client ? `${job.client.firstName || ''} ${job.client.lastName || ''}`.trim() : 'Unknown';
        jobVisitData[jobId] = {
          visitCount: completed.length,
          allVisitDates: visitDates,
          jobTotal: parseFloat(job.total) || 0,
          clientName,
          title: job.title || '',
          jobNumber: job.jobNumber || null,
        };
      } catch (err) {
        console.error(`[Labor] Failed to fetch job ${jobId}:`, err.message);
        // Fallback: treat as multi-visit with unknown details
        jobVisitData[jobId] = { visitCount: 2, allVisitDates: [], jobTotal: 0, clientName: 'Unknown', title: '', jobNumber: null };
      }
    }));
    if (i + BATCH_SIZE < timesheetOnlyJobIds.length) await new Promise(r => setTimeout(r, 300));
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

  // ── Step 3: Fetch full-range timesheets & expenses in ONE call if range expanded ──
  let fullTimesheets = timesheets;
  let fullExpenses = expenses;
  if (wideStart < start || wideEnd > end) {
    [fullTimesheets, fullExpenses] = await Promise.all([
      fetchTimesheets(wideStart, wideEnd),
      fetchExpenses(wideStart, wideEnd),
    ]);
  }

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
    for (const [dateStr, dayHours] of Object.entries(hoursByDate)) {
      if (!grouped[dateStr]) continue;
      const proportion = totalJobHours > 0 ? dayHours / totalJobHours : 0;

      grouped[dateStr].visits.push({
        id: `${jobId}-${dateStr}`,
        title,
        completedAt: dateStr,
        jobId,
        jobNumber,
        client: clientName,
        jobTotal: jobTotal * proportion,
        rawJobTotal: jobTotal,
        totalJobHours,
        totalJobExpenses,
        actualDailyHours: dayHours,
        jobExpenses: totalJobExpenses * proportion,
        labor: {
          totalHours: dayHours,
          totalCost: costByDate[dateStr] || 0,
          byPerson: personByDate[dateStr] || {},
        },
      });
      grouped[dateStr].revenue += jobTotal * proportion;
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
  return res.json(grouped);
}

// ── Router ──

export default async function handler(req, res) {
  try {
    const action = req.query.action;
    if (action === 'clients') return handleClientSearch(req, res);
    if (action === 'labor') return handleLaborData(req, res);
    return res.status(400).json({ error: 'action param required: clients | labor' });
  } catch (err) {
    console.error('[Jobber Data] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
