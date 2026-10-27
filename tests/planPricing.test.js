import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pricePlan, perVisitFromMonthly, VISITS } from '../src/lib/planPricing.js';

test('growing season is flat when leaves cost the same as mowing', () => {
  // 39 visits: 6 leaf (mid-Oct to Nov 30), 33 mow
  const p = pricePlan({ plan: 'growing', frequency: 'weekly', lawn: 55, leaves: 55 });
  assert.equal(p.totalVisits, 39);
  assert.equal(p.leafVisits, 6);
  assert.equal(p.perVisit, 55);
  assert.equal(p.annual, 2145);          // 55 × 39
  assert.equal(p.monthly, 238.33);       // over 9 billing months
});

test('year-round blends lawn and leaves across their own seasons, weeds on every visit', () => {
  // 52 visits: 10 leaf, 42 mow. lawn 55, leaves 70, weeds 12
  const p = pricePlan({ plan: 'yearRound', frequency: 'weekly', lawn: 55, leaves: 70, weeds: 12 });
  assert.equal(p.mowVisits, 42);
  assert.equal(p.leafVisits, 10);
  assert.equal(p.parts.lawn, 2310);      // 55 × 42
  assert.equal(p.parts.leaves, 700);     // 70 × 10
  assert.equal(p.parts.weeds, 624);      // 12 × 52
  assert.equal(p.annual, 3634);
  assert.equal(p.perVisit, 69.88);
  assert.equal(p.monthly, 302.83);
  // the whole year's visits add back up to the annual bill
  assert.equal(Math.round(p.perVisit * 52), Math.round(p.annual));
});

test('pricing lawn and leaves the same collapses the blend — flat labor case', () => {
  const p = pricePlan({ plan: 'yearRound', frequency: 'weekly', lawn: 60, leaves: 60, weeds: 10 });
  assert.equal(p.perVisit, 70);          // 60 + 10, every visit, no seasonality
  assert.equal(p.flat, true);
});

test('every other week uses 26 visits, not 24, with mowing and weeds at 1.5×', () => {
  // 26 visits: 5 leaf, 21 mow. mow 80 × 1.5 = 120, weeds 15 × 1.5 = 22.5
  const p = pricePlan({ plan: 'yearRound', frequency: 'eow', lawn: 80, leaves: 80, weeds: 15 });
  assert.equal(p.totalVisits, 26);
  assert.equal(p.annual, 3505);          // 120 × 21 + 80 × 5 + 22.5 × 26
  assert.equal(p.perVisit, 134.81);
  assert.equal(p.monthly, 292.08);
});

test('perVisitFromMonthly fixes the divide-by-4 overstatement', () => {
  // $300/month weekly: ÷4 would say $75 and log $3,900 against $3,600 collected
  assert.equal(perVisitFromMonthly(300, 'weekly'), 69.23);
  assert.equal(Math.round(69.23 * 52), 3600);
  assert.equal(perVisitFromMonthly(300, 'eow'), 138.46);
  assert.equal(Math.round(138.46 * 26), 3600);
  // growing season bills 9 months over 39 visits
  assert.equal(perVisitFromMonthly(240, 'weekly', 'growing'), 55.38);
});

test('visit tables are the real counts', () => {
  assert.equal(VISITS.yearRound.weekly, 52);
  assert.equal(VISITS.yearRound.eow, 26);
  assert.equal(VISITS.growing.billingMonths, 9);
});
