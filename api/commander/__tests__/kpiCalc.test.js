// KPI calculation tests for empty/edge-case ranges
// These test the metric definitions without needing a DB

function computeKpis({ leads, quotesSent, quotesApproved, starts, cancels, daysToQuote, daysToStart }) {
  const newLeads = leads;
  const netGrowth = starts - cancels;
  const approvalRate = quotesSent > 0 ? Math.round((quotesApproved / quotesSent) * 1000) / 10 : 0;
  const leadsToQuoteRate = newLeads > 0 ? Math.round((quotesSent / newLeads) * 1000) / 10 : 0;
  const avgDaysToQuote = daysToQuote.length > 0
    ? Math.round((daysToQuote.reduce((a, b) => a + b, 0) / daysToQuote.length) * 10) / 10
    : null;
  const avgDaysToStart = daysToStart.length > 0
    ? Math.round((daysToStart.reduce((a, b) => a + b, 0) / daysToStart.length) * 10) / 10
    : null;

  return { newLeads, quotesSent, quotesApproved, starts, cancels, netGrowth, approvalRate, leadsToQuoteRate, avgDaysToQuote, avgDaysToStart };
}

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label} = ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

// Test 1: Empty range (no data)
const empty = computeKpis({ leads: 0, quotesSent: 0, quotesApproved: 0, starts: 0, cancels: 0, daysToQuote: [], daysToStart: [] });
assert('empty.newLeads', empty.newLeads, 0);
assert('empty.quotesSent', empty.quotesSent, 0);
assert('empty.quotesApproved', empty.quotesApproved, 0);
assert('empty.starts', empty.starts, 0);
assert('empty.cancels', empty.cancels, 0);
assert('empty.netGrowth', empty.netGrowth, 0);
assert('empty.approvalRate', empty.approvalRate, 0);
assert('empty.leadsToQuoteRate', empty.leadsToQuoteRate, 0);
assert('empty.avgDaysToQuote', empty.avgDaysToQuote, null);
assert('empty.avgDaysToStart', empty.avgDaysToStart, null);

// Test 2: Typical range
const typical = computeKpis({ leads: 10, quotesSent: 6, quotesApproved: 3, starts: 2, cancels: 1, daysToQuote: [2, 3, 5], daysToStart: [10, 14] });
assert('typical.newLeads', typical.newLeads, 10);
assert('typical.netGrowth', typical.netGrowth, 1);
assert('typical.approvalRate', typical.approvalRate, 50);
assert('typical.leadsToQuoteRate', typical.leadsToQuoteRate, 60);
assert('typical.avgDaysToQuote', typical.avgDaysToQuote, 3.3);
assert('typical.avgDaysToStart', typical.avgDaysToStart, 12);

// Test 3: Negative net growth
const neg = computeKpis({ leads: 2, quotesSent: 1, quotesApproved: 0, starts: 0, cancels: 3, daysToQuote: [], daysToStart: [] });
assert('neg.netGrowth', neg.netGrowth, -3);
assert('neg.approvalRate', neg.approvalRate, 0);

// Test 4: No leads but quotes (edge case)
const noLeads = computeKpis({ leads: 0, quotesSent: 5, quotesApproved: 2, starts: 1, cancels: 0, daysToQuote: [1], daysToStart: [7] });
assert('noLeads.leadsToQuoteRate', noLeads.leadsToQuoteRate, 0);
assert('noLeads.approvalRate', noLeads.approvalRate, 40);

console.log(`\nKPI calculations: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
