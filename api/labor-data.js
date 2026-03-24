import { jobberQuery } from '../lib/jobberClient.js';

async function fetchVisits(start, end) {
  const endPlusOne = new Date(end + 'T00:00:00');
  endPlusOne.setDate(endPlusOne.getDate() + 1);
  const endISO = endPlusOne.toISOString();
  const startISO = new Date(start + 'T00:00:00').toISOString();

  const allVisits = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    let data;
    try {
      data = await jobberQuery(`{
        visits(first: 100${after}, filter: { startAt: { after: "${startISO}", before: "${endISO}" } }) {
          nodes {
            id title completedAt startAt endAt
            job { id jobNumber total client { firstName lastName } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`);
    } catch {
      // Fallback without filter
      data = await jobberQuery(`{
        visits(first: 100${after}) {
          nodes { id title completedAt startAt endAt job { id jobNumber total client { firstName lastName } } }
          pageInfo { hasNextPage endCursor }
        }
      }`);
    }
    allVisits.push(...(data.visits?.nodes || []));
    hasNext = data.visits?.pageInfo?.hasNextPage || false;
    cursor = data.visits?.pageInfo?.endCursor || null;
    if (allVisits.length > 500) break;
  }

  return allVisits.filter((v) => {
    const date = (v.completedAt || v.startAt || '').split('T')[0];
    return date >= start && date <= end;
  });
}

async function fetchTimesheets(start, end) {
  const endPlusOne = new Date(end + 'T00:00:00');
  endPlusOne.setDate(endPlusOne.getDate() + 1);
  const endISO = endPlusOne.toISOString();
  const startISO = new Date(start + 'T00:00:00').toISOString();

  const allEntries = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await jobberQuery(`{
      timeSheetEntries(first: 100${after}, filter: { startAt: { after: "${startISO}", before: "${endISO}" } }) {
        nodes {
          id startAt endAt duration
          user { id name { full } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`);
    allEntries.push(...(data.timeSheetEntries?.nodes || []));
    hasNext = data.timeSheetEntries?.pageInfo?.hasNextPage || false;
    cursor = data.timeSheetEntries?.pageInfo?.endCursor || null;
    if (allEntries.length > 1000) break;
  }

  return allEntries;
}

export default async function laborDataHandler(req, res) {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params required (YYYY-MM-DD)' });
    }

    const [visits, timesheets] = await Promise.all([
      fetchVisits(start, end),
      fetchTimesheets(start, end),
    ]);

    // Group visits by date
    const grouped = {};

    // Initialize all dates in range
    const cur = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T00:00:00');
    while (cur <= endDate) {
      const ds = cur.toISOString().split('T')[0];
      grouped[ds] = { visits: [], revenue: 0, labor: { totalHours: 0, byPerson: {} } };
      cur.setDate(cur.getDate() + 1);
    }

    // Fill visits
    for (const visit of visits) {
      const dateStr = (visit.completedAt || visit.startAt || '').split('T')[0];
      if (!dateStr || !grouped[dateStr]) continue;

      const revenue = parseFloat(visit.job?.total) || 0;
      grouped[dateStr].visits.push({
        id: visit.id,
        title: visit.title,
        completedAt: visit.completedAt,
        jobNumber: visit.job?.jobNumber,
        jobTotal: revenue,
        client: visit.job?.client
          ? `${visit.job.client.firstName || ''} ${visit.job.client.lastName || ''}`.trim()
          : 'Unknown',
      });
      grouped[dateStr].revenue += revenue;
    }

    // Fill timesheets
    for (const entry of timesheets) {
      const dateStr = (entry.startAt || '').split('T')[0];
      if (!dateStr || !grouped[dateStr]) continue;

      const hours = (entry.duration || 0) / 3600;
      const name = entry.user?.name?.full || 'Unknown';

      grouped[dateStr].labor.totalHours += hours;
      if (!grouped[dateStr].labor.byPerson[name]) {
        grouped[dateStr].labor.byPerson[name] = 0;
      }
      grouped[dateStr].labor.byPerson[name] += hours;
    }

    // Round values
    for (const date of Object.keys(grouped)) {
      grouped[date].revenue = Math.round(grouped[date].revenue * 100) / 100;
      grouped[date].labor.totalHours = Math.round(grouped[date].labor.totalHours * 100) / 100;
      for (const name of Object.keys(grouped[date].labor.byPerson)) {
        grouped[date].labor.byPerson[name] = Math.round(grouped[date].labor.byPerson[name] * 100) / 100;
      }
    }

    return res.json(grouped);
  } catch (err) {
    console.error('[Labor Data] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
