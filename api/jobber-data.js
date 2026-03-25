import { jobberQuery } from '../lib/jobberClient.js';

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

async function handleLaborData(req, res) {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end required' });

  const [visits, timesheets] = await Promise.all([fetchVisits(start, end), fetchTimesheets(start, end)]);

  const grouped = {};
  const cur = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  while (cur <= endDate) { const ds = cur.toISOString().split('T')[0]; grouped[ds] = { visits: [], revenue: 0, labor: { totalHours: 0, totalCost: 0, byPerson: {} } }; cur.setDate(cur.getDate() + 1); }

  for (const visit of visits) {
    const dateStr = (visit.completedAt || visit.startAt || '').split('T')[0];
    if (!dateStr || !grouped[dateStr]) continue;
    const revenue = parseFloat(visit.job?.total) || 0;
    grouped[dateStr].visits.push({ id: visit.id, title: visit.title, completedAt: visit.completedAt, jobId: visit.job?.id, jobNumber: visit.job?.jobNumber, jobTotal: revenue, client: visit.job?.client ? `${visit.job.client.firstName || ''} ${visit.job.client.lastName || ''}`.trim() : 'Unknown', labor: { totalHours: 0, totalCost: 0, byPerson: {} } });
    grouped[dateStr].revenue += revenue;
  }

  for (const entry of timesheets) {
    const dateStr = (entry.startAt || '').split('T')[0];
    if (!dateStr || !grouped[dateStr]) continue;
    const hours = (entry.duration || 0) / 3600;
    const rate = entry.labourRate || 0;
    const cost = hours * rate;
    const name = entry.user?.name?.full || 'Unknown';
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

    // Attach labor to matching visit by job ID
    if (hasJob) {
      const visit = grouped[dateStr].visits.find(v => v.jobId === entry.job.id);
      if (visit) {
        visit.labor.totalHours += hours;
        visit.labor.totalCost += cost;
        if (!visit.labor.byPerson[name]) visit.labor.byPerson[name] = { hours: 0, rate, cost: 0 };
        visit.labor.byPerson[name].hours += hours;
        visit.labor.byPerson[name].cost += cost;
        if (rate > 0) visit.labor.byPerson[name].rate = rate;
      }
    }
  }

  const r2 = v => Math.round(v * 100) / 100;
  for (const date of Object.keys(grouped)) {
    grouped[date].revenue = r2(grouped[date].revenue);
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
