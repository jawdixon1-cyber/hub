import { jobberQuery } from '../../lib/jobberClient.js';

// ── Fetch All Quotes (paginated) ──

async function fetchRequests() {
  const allNodes = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const query = `{
      requests(first: 100${after}) {
        nodes {
          id
          createdAt
          source
          requestStatus
          client {
            firstName
            lastName
            createdAt
            sourceAttribution {
              displayLeadSource
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`;
    const data = await jobberQuery(query);
    const nodes = data.requests?.nodes || [];
    allNodes.push(...nodes);
    hasNext = data.requests?.pageInfo?.hasNextPage || false;
    cursor = data.requests?.pageInfo?.endCursor || null;
  }
  return allNodes;
}

// ── Fetch All Quotes (paginated) ──

async function fetchAllQuotes() {
  const allNodes = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const query = `{
      quotes(first: 100${after}) {
        nodes {
          id
          quoteNumber
          quoteStatus
          amounts { total }
          createdAt
          updatedAt
          sentAt
          lastTransitioned { approvedAt convertedAt }
          client {
            id
            firstName
            lastName
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`;
    const data = await jobberQuery(query);
    const nodes = data.quotes?.nodes || [];
    allNodes.push(...nodes);
    hasNext = data.quotes?.pageInfo?.hasNextPage || false;
    cursor = data.quotes?.pageInfo?.endCursor || null;
  }
  return allNodes;
}

// ── Fetch All Recurring Jobs (paginated) ──

async function fetchRecurringJobs() {
  const allNodes = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const query = `{
      jobs(first: 100, filter: { jobType: RECURRING }${after}) {
        nodes {
          id
          jobNumber
          jobStatus
          total
          startAt
          completedAt
          createdAt
          visitSchedule {
            startDate
            endDate
            recurrenceSchedule { calendarRule }
          }
          client {
            id
            firstName
            lastName
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`;
    const data = await jobberQuery(query);
    const nodes = data.jobs?.nodes || [];
    allNodes.push(...nodes);
    hasNext = data.jobs?.pageInfo?.hasNextPage || false;
    cursor = data.jobs?.pageInfo?.endCursor || null;
  }
  return allNodes;
}

// ── Estimate monthly value from visit total and RRULE ──

function parseFrequency(calendarRule) {
  if (!calendarRule) return { label: 'Unknown', visitsPerMonth: 0 };
  const freqMatch = calendarRule.match(/FREQ=(\w+)/);
  const intervalMatch = calendarRule.match(/INTERVAL=(\d+)/);
  const freq = freqMatch ? freqMatch[1] : 'WEEKLY';
  const interval = intervalMatch ? parseInt(intervalMatch[1]) : 1;

  let visitsPerMonth;
  let label;
  switch (freq) {
    case 'WEEKLY':
      visitsPerMonth = 4.33 / interval;
      label = interval === 1 ? 'Weekly' : interval === 2 ? 'Every 2 weeks' : `Every ${interval} weeks`;
      break;
    case 'DAILY':
      visitsPerMonth = 30 / interval;
      label = interval === 1 ? 'Daily' : `Every ${interval} days`;
      break;
    case 'MONTHLY':
      visitsPerMonth = 1 / interval;
      label = interval === 1 ? 'Monthly' : `Every ${interval} months`;
      break;
    default:
      visitsPerMonth = 4.33;
      label = 'Weekly';
  }
  return { label, visitsPerMonth };
}

function estimateMonthlyValue(total, calendarRule) {
  if (!total || !calendarRule) return total || 0;
  const { visitsPerMonth } = parseFrequency(calendarRule);
  return Math.round(total * visitsPerMonth * 100) / 100;
}

// ── Normalize lead source labels ──

function normalizeSource(raw) {
  if (!raw) return 'Other';
  const lower = raw.toLowerCase().trim();
  if (lower === 'online-search' || lower === 'online search' || lower.includes('google')) return 'Online Search';
  if (lower === 'internal' || lower === 'jobber') return 'Internal / Jobber';
  if (lower.includes('facebook') || lower.includes('meta')) return 'Facebook';
  if (lower.includes('referral') || lower.includes('word of mouth')) return 'Referral';
  if (lower.includes('website') || lower.includes('web')) return 'Website';
  if (lower.includes('yelp')) return 'Yelp';
  if (lower.includes('nextdoor')) return 'Nextdoor';
  if (lower.includes('thumbtack')) return 'Thumbtack';
  if (lower === 'other') return 'Other';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ── Simple in-memory cache (refresh every 5 min) ──

let cachedData = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getJobberData() {
  if (cachedData && Date.now() - cacheTime < CACHE_TTL) {
    return cachedData;
  }
  console.log('[Commander] Fetching fresh data from Jobber...');
  const [requests, quotes, recurringJobs] = await Promise.all([
    fetchRequests(),
    fetchAllQuotes(),
    fetchRecurringJobs(),
  ]);
  cachedData = { requests, quotes, recurringJobs };
  cacheTime = Date.now();
  console.log(`[Commander] Got ${requests.length} requests, ${quotes.length} quotes, ${recurringJobs.length} recurring jobs`);
  return cachedData;
}

// ── GET /api/commander/summary?start=YYYY-MM-DD&end=YYYY-MM-DD ──

export default async function handler(req, res) {
  try {
    const { start, end, refresh, view } = req.query;

    // Bust cache if requested
    if (refresh === '1') {
      cachedData = null;
      cacheTime = 0;
    }

    // Pipeline view — returns current state of all open requests & quotes
    if (view === 'pipeline') {
      try {
        return await handlePipeline(req, res);
      } catch (err) {
        console.error('[Pipeline] Error:', err);
        return res.status(500).json({ error: err.message });
      }
    }

    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params required (YYYY-MM-DD)' });
    }

    // Offset to Eastern Time: EDT (Mar–Nov) = UTC-4, EST (Nov–Mar) = UTC-5
    // "midnight ET" = 4am or 5am UTC
    const mo = parseInt(start.split('-')[1]);
    const utcHour = (mo >= 3 && mo < 11) ? '04' : '05';
    const rangeStart = `${start}T${utcHour}:00:00.000Z`;
    const rangeEnd = `${end}T${utcHour}:00:00.000Z`;

    const { requests, quotes, recurringJobs } = await getJobberData();

    // ── Process Requests ──
    const leadsInRange = requests.filter(r =>
      r.createdAt && r.createdAt >= rangeStart && r.createdAt < rangeEnd
    );

    // ── Process Quotes ──
    const quotesSentInRange = quotes.filter(q =>
      q.sentAt && q.sentAt >= rangeStart && q.sentAt < rangeEnd
    );
    const quotesApprovedInRange = quotes.filter(q => {
      const approvedAt = q.lastTransitioned?.approvedAt;
      const isApproved = q.quoteStatus === 'approved' || q.quoteStatus === 'converted';
      if (!isApproved) return false;
      const effectiveDate = approvedAt || q.updatedAt;
      return effectiveDate && effectiveDate >= rangeStart && effectiveDate < rangeEnd;
    });

    // ── Process Recurring Jobs ──
    // Use createdAt (when booked) for "starts" — not the first visit date
    const processedJobs = recurringJobs.map(job => {
      const calRule = job.visitSchedule?.recurrenceSchedule?.calendarRule;
      const monthlyValue = estimateMonthlyValue(job.total, calRule);
      const isCanceled = job.jobStatus === 'cancelled' || job.jobStatus === 'archived';
      return {
        ...job,
        bookedDate: job.createdAt,
        effectiveCanceledDate: isCanceled ? (job.completedAt || job.createdAt) : null,
        monthlyValue,
        isCanceled,
      };
    });

    const startsInRange = processedJobs.filter(j =>
      j.bookedDate && j.bookedDate >= rangeStart && j.bookedDate < rangeEnd
    );
    const cancelsInRange = processedJobs.filter(j =>
      j.effectiveCanceledDate && j.effectiveCanceledDate >= rangeStart && j.effectiveCanceledDate < rangeEnd
    );
    const activeJobs = processedJobs.filter(j => !j.isCanceled);

    // ── KPIs ──
    const newLeads = leadsInRange.length;
    const quotesSent = quotesSentInRange.length;
    const quotesApproved = quotesApprovedInRange.length;
    const recurringStarts = startsInRange.length;
    const cancels = cancelsInRange.length;
    const netGrowth = recurringStarts - cancels;
    const approvalRate = quotesSent > 0 ? quotesApproved / quotesSent : 0;
    const leadsToQuoteRate = newLeads > 0 ? quotesSent / newLeads : 0;

    const startsMonthlyRevenue = startsInRange
      .filter(j => j.monthlyValue)
      .reduce((sum, j) => sum + j.monthlyValue, 0);

    const activeRecurringClients = new Set(activeJobs.map(j => j.client?.id).filter(Boolean));
    const activeRecurringCount = activeRecurringClients.size;

    // Build detailed recurring client roster (deduplicate by client, aggregate jobs)
    const clientRoster = {};
    for (const job of activeJobs) {
      const cid = job.client?.id;
      if (!cid) continue;
      const name = `${job.client.firstName || ''} ${job.client.lastName || ''}`.trim() || 'Unknown';
      const calRule = job.visitSchedule?.recurrenceSchedule?.calendarRule;
      const { label: freqLabel } = parseFrequency(calRule);
      if (!clientRoster[cid]) {
        clientRoster[cid] = { name, jobs: [], totalPerVisit: 0, totalMonthly: 0 };
      }
      clientRoster[cid].jobs.push({ jobNumber: job.jobNumber, frequency: freqLabel, perVisit: job.total || 0, monthly: job.monthlyValue || 0 });
      clientRoster[cid].totalPerVisit += (job.total || 0);
      clientRoster[cid].totalMonthly += (job.monthlyValue || 0);
    }
    const recurringClientList = Object.values(clientRoster)
      .map(c => ({
        name: c.name,
        jobCount: c.jobs.length,
        jobs: c.jobs,
        perVisit: Math.round(c.totalPerVisit * 100) / 100,
        monthly: Math.round(c.totalMonthly * 100) / 100,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // ── Source Table (from client's Lead Source field) ──
    // New client = client created within 7 days of request
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const sourceGroups = {};
    const missingSourceLeads = [];
    for (const lead of leadsInRange) {
      const name = `${lead.client?.firstName || ''} ${lead.client?.lastName || ''}`.trim() || 'Unknown';
      const requestDate = new Date(lead.createdAt).getTime();
      const clientDate = lead.client?.createdAt ? new Date(lead.client.createdAt).getTime() : 0;
      const isNewClient = clientDate > 0 && Math.abs(requestDate - clientDate) <= SEVEN_DAYS;

      let src;
      if (!isNewClient) {
        src = 'Returning Client';
      } else {
        const clientLeadSource = lead.client?.sourceAttribution?.displayLeadSource;
        if (!clientLeadSource) {
          missingSourceLeads.push(name);
          src = 'No Source Set';
        } else {
          src = normalizeSource(clientLeadSource);
        }
      }

      if (!sourceGroups[src]) {
        sourceGroups[src] = { source: src, leads: 0 };
      }
      sourceGroups[src].leads++;
    }
    const sourceTable = Object.values(sourceGroups).map(group => ({
      source: group.source,
      leads: group.leads,
      quotesSent: 0,
      wonRecurring: 0,
      approvalRate: 0,
      estimatedMonthlyValue: 0,
    }));

    // ── Pipeline Breakdown (requests in range by status) ──
    const pipeline = { new: 0, scheduled: 0, converted: 0, archived: 0, newNames: [], scheduledNames: [] };
    for (const r of leadsInRange) {
      const s = r.requestStatus;
      const name = `${r.client?.firstName || ''} ${r.client?.lastName || ''}`.trim() || 'Unknown';
      if (s === 'new') { pipeline.new++; pipeline.newNames.push(name); }
      else if (s === 'today' || s === 'upcoming') { pipeline.scheduled++; pipeline.scheduledNames.push(name); }
      else if (s === 'converted') pipeline.converted++;
      else if (s === 'archived') pipeline.archived++;
    }

    // ── Trends: Last 12 Weeks ──
    const trends = computeTrends(processedJobs, requests);

    return res.json({
      range: { start, end },
      kpis: {
        newLeads,
        quotesSent,
        quotesApproved,
        recurringStarts,
        cancels,
        netGrowth,
        approvalRate: Math.round(approvalRate * 1000) / 10,
        leadsToQuoteRate: Math.round(leadsToQuoteRate * 1000) / 10,
        avgDaysToQuote: null,
        avgDaysToStart: null,
        startsMonthlyRevenue: Math.round(startsMonthlyRevenue * 100) / 100,
      },
      pipeline,
      activeRecurringCount,
      recurringClientList,
      leadNames: leadsInRange.map(r => `${r.client?.firstName || ''} ${r.client?.lastName || ''}`.trim() || 'Unknown').filter(Boolean),
      quotesSentNames: quotesSentInRange.map(q => `${q.client?.firstName || ''} ${q.client?.lastName || ''}`.trim()).filter(Boolean),
      quotesApprovedNames: quotesApprovedInRange.map(q => `${q.client?.firstName || ''} ${q.client?.lastName || ''}`.trim()).filter(Boolean),
      recurringStartNames: startsInRange.map(j => `${j.client?.firstName || ''} ${j.client?.lastName || ''}`.trim()).filter(Boolean),
      sourceTable,
      missingSourceLeads,
      trends,
    });
  } catch (err) {
    console.error('[Commander Summary] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function handlePipeline(req, res) {
  const { requests, quotes } = await getJobberData();
  const now = Date.now();

  function daysSince(dateStr) {
    if (!dateStr) return null;
    return Math.floor((now - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  }

  // Requests — group by stage
  const requestCards = requests
    .filter(r => r.requestStatus !== 'converted' && r.requestStatus !== 'archived')
    .map(r => ({
      id: r.id,
      name: `${r.client?.firstName || ''} ${r.client?.lastName || ''}`.trim() || 'Unknown',
      stage: r.requestStatus === 'new' ? 'new_request'
        : (r.requestStatus === 'today' || r.requestStatus === 'upcoming') ? 'assessment_scheduled'
        : 'new_request',
      createdAt: r.createdAt,
      daysInPipeline: daysSince(r.createdAt),
      source: r.source || null,
      type: 'request',
    }));

  // Quotes — only open ones
  const quoteCards = quotes
    .filter(q => q.quoteStatus === 'draft' || q.quoteStatus === 'awaiting_response' || q.quoteStatus === 'sent')
    .map(q => ({
      id: q.id,
      name: `${q.client?.firstName || ''} ${q.client?.lastName || ''}`.trim() || 'Unknown',
      quoteNumber: q.quoteNumber,
      stage: q.quoteStatus === 'draft' ? 'quote_draft'
        : 'awaiting_response',
      total: q.amounts?.total ? parseFloat(q.amounts.total) : 0,
      sentAt: q.sentAt,
      createdAt: q.createdAt,
      daysSinceSent: daysSince(q.sentAt),
      daysInPipeline: daysSince(q.createdAt),
      type: 'quote',
    }));

  // Recently won (last 30 days)
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const wonCards = quotes
    .filter(q => {
      const isWon = q.quoteStatus === 'approved' || q.quoteStatus === 'converted';
      const approvedAt = q.lastTransitioned?.approvedAt || q.updatedAt;
      return isWon && approvedAt >= thirtyDaysAgo;
    })
    .map(q => ({
      id: q.id,
      name: `${q.client?.firstName || ''} ${q.client?.lastName || ''}`.trim() || 'Unknown',
      quoteNumber: q.quoteNumber,
      stage: 'won',
      total: q.amounts?.total ? parseFloat(q.amounts.total) : 0,
      approvedAt: q.lastTransitioned?.approvedAt || q.updatedAt,
      type: 'quote',
    }));

  const stages = [
    { id: 'new_request', label: 'New Requests', cards: requestCards.filter(c => c.stage === 'new_request') },
    { id: 'assessment_scheduled', label: 'Assessment Scheduled', cards: requestCards.filter(c => c.stage === 'assessment_scheduled') },
    { id: 'quote_draft', label: 'Quote Drafts', cards: quoteCards.filter(c => c.stage === 'quote_draft') },
    { id: 'awaiting_response', label: 'Awaiting Response', cards: quoteCards.filter(c => c.stage === 'awaiting_response') },
    { id: 'won', label: 'Won (Last 30d)', cards: wonCards },
  ];

  // Sort each stage: oldest first (stale leads bubble up)
  for (const stage of stages) {
    if (stage.id === 'won') {
      stage.cards.sort((a, b) => new Date(b.approvedAt || 0) - new Date(a.approvedAt || 0));
    } else {
      stage.cards.sort((a, b) => (b.daysInPipeline || 0) - (a.daysInPipeline || 0));
    }
  }

  return res.json({ stages });
}

function computeTrends(processedJobs, requests) {
  const now = new Date();
  const day = now.getUTCDay();
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const thisMonday = new Date(now);
  thisMonday.setUTCDate(thisMonday.getUTCDate() + diffToMonday);
  thisMonday.setUTCHours(0, 0, 0, 0);

  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const weekStart = new Date(thisMonday);
    weekStart.setUTCDate(weekStart.getUTCDate() - i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    weeks.push({
      weekStart: weekStart.toISOString().split('T')[0],
      weekEndISO: weekEnd.toISOString(),
      weekStartISO: weekStart.toISOString(),
    });
  }

  const weeklyNetGrowth = weeks.map(w => {
    const wStarts = processedJobs.filter(j =>
      j.bookedDate && j.bookedDate >= w.weekStartISO && j.bookedDate < w.weekEndISO
    ).length;
    const wCancels = processedJobs.filter(j =>
      j.effectiveCanceledDate && j.effectiveCanceledDate >= w.weekStartISO && j.effectiveCanceledDate < w.weekEndISO
    ).length;
    const wLeads = requests.filter(c =>
      c.createdAt && c.createdAt >= w.weekStartISO && c.createdAt < w.weekEndISO
    ).length;
    return {
      weekStart: w.weekStart,
      starts: wStarts,
      cancels: wCancels,
      net: wStarts - wCancels,
      leads: wLeads,
    };
  });

  return { weeklyNetGrowth, leadsBySource: [] };
}
