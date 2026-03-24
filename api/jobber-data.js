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
    const data = await jobberQuery(`{ timeSheetEntries(first: 100${after}, filter: { startAt: { after: "${startISO}", before: "${endISO}" } }) { nodes { id startAt endAt duration user { id name { full } } } pageInfo { hasNextPage endCursor } } }`);
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
  while (cur <= endDate) { const ds = cur.toISOString().split('T')[0]; grouped[ds] = { visits: [], revenue: 0, labor: { totalHours: 0, byPerson: {} } }; cur.setDate(cur.getDate() + 1); }

  for (const visit of visits) {
    const dateStr = (visit.completedAt || visit.startAt || '').split('T')[0];
    if (!dateStr || !grouped[dateStr]) continue;
    const revenue = parseFloat(visit.job?.total) || 0;
    grouped[dateStr].visits.push({ id: visit.id, title: visit.title, completedAt: visit.completedAt, jobNumber: visit.job?.jobNumber, jobTotal: revenue, client: visit.job?.client ? `${visit.job.client.firstName || ''} ${visit.job.client.lastName || ''}`.trim() : 'Unknown' });
    grouped[dateStr].revenue += revenue;
  }

  for (const entry of timesheets) {
    const dateStr = (entry.startAt || '').split('T')[0];
    if (!dateStr || !grouped[dateStr]) continue;
    const hours = (entry.duration || 0) / 3600;
    const name = entry.user?.name?.full || 'Unknown';
    grouped[dateStr].labor.totalHours += hours;
    if (!grouped[dateStr].labor.byPerson[name]) grouped[dateStr].labor.byPerson[name] = 0;
    grouped[dateStr].labor.byPerson[name] += hours;
  }

  for (const date of Object.keys(grouped)) {
    grouped[date].revenue = Math.round(grouped[date].revenue * 100) / 100;
    grouped[date].labor.totalHours = Math.round(grouped[date].labor.totalHours * 100) / 100;
    for (const n of Object.keys(grouped[date].labor.byPerson)) grouped[date].labor.byPerson[n] = Math.round(grouped[date].labor.byPerson[n] * 100) / 100;
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
