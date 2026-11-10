import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bonusFor, splitPool, computeWeek, computeJob } from '../src/lib/weeklyBonus.js';

const people = [
  { id: 'a', name: 'Ann', hourly_rate: 20, active: true },
  { id: 'b', name: 'Bo', hourly_rate: 25, active: true },
];

test('bonusFor: under target pays the gap, over target pays nothing', () => {
  // margin 1000, target 30% → 300 allowed; wages 200 → pool 100
  assert.equal(bonusFor({ revenue: 1200, cogs: 200, prodWages: 200, targetPct: 30 }).pool, 100);
  assert.equal(bonusFor({ revenue: 1200, cogs: 200, prodWages: 400, targetPct: 30 }).pool, 0);
  assert.equal(bonusFor({ revenue: 0, cogs: 0, prodWages: 100, targetPct: 30 }).laborPct, null);
});

test('splitPool: by minutes, cents add up', () => {
  const s = splitPool(100, { a: 60, b: 120 });
  assert.deepEqual(s, { a: 33.33, b: 66.67 });
  assert.deepEqual(splitPool(0, { a: 60 }), {});
});

test('computeWeek: unfinished-job hours are paid but held out of the bonus', () => {
  const row = { days: { '2026-09-21': { revenue: 3000, cogs: 200 } }, employer_taxes: 50,
    people: { a: { prod_minutes: 600, np_minutes: 60, rate: 20 }, b: { prod_minutes: 600, np_minutes: 0, rate: 25 } } };
  const jobs = [{ id: 'j1', name: 'Big cleanup', opened_week: '2026-09-26', done_week: null, revenue: 0,
    holds: { '2026-09-26': { people: { a: 240 }, cogs: 100 } } }];
  const r = computeWeek({ weekEnding: '2026-09-26', row, weeks: { '2026-09-26': row }, people, jobs, targetPct: 30 });
  const ann = r.people.find((p) => p.id === 'a');
  assert.equal(ann.job_minutes, 240);
  assert.equal(ann.wages, 20 * (600 + 60 + 240) / 60);        // all hours paid
  assert.equal(ann.prod_wages, 200);                          // only prod hours in the bonus math
  // margin 2800 → 840 allowed; prod wages 200 + 250 = 450 → pool 390, split 50/50 by prod minutes
  assert.equal(r.week.pool, 390);
  assert.deepEqual(r.weekShares, { a: 195, b: 195 });
  assert.equal(r.openJobs.length, 1);
  assert.equal(r.doneJobs.length, 0);
  assert.equal(r.totals.cogs, 200);                           // job COGS not in the week's number while open
});

test('computeJob + done week: job bonus uses each week\'s rate snapshot and splits by job minutes', () => {
  const w1 = { people: { a: { rate: 20 }, b: { rate: 25 } } };          // Ann was $20 in week 1
  const w2 = { people: { a: { rate: 22 }, b: { rate: 25 } }, days: {} }; // $22 in week 2
  const job = { id: 'j1', name: 'Big cleanup', opened_week: '2026-09-19', done_week: '2026-09-26', revenue: 0,
    holds: { '2026-09-19': { people: { a: 240 }, cogs: 100, revenue: 500 }, '2026-09-26': { people: { a: 60, b: 120 }, cogs: 50, revenue: 1500 } } }; // deposit, then balance
  const weeks = { '2026-09-19': w1, '2026-09-26': w2 };
  const j = computeJob(job, { weeks, people, targetPct: 30 });
  // wages: a 4h×20 + 1h×22 = 102; b 2h×25 = 50 → 152. margin 1850 → 555 allowed → pool 403
  assert.equal(j.revenue, 2000);                             // deposit + balance
  assert.equal(j.prodWages, 152);
  assert.equal(j.pool, 403);
  assert.deepEqual(j.shares, { a: 287.86, b: 115.14 });      // 300 vs 120 minutes
  assert.equal(j.perWeek[0].revenueShare, 1142.86);           // 240 of 420 minutes
  const r = computeWeek({ weekEnding: '2026-09-26', row: w2, weeks, people, jobs: [job], targetPct: 30 });
  assert.equal(r.doneJobs.length, 1);
  assert.equal(r.people.find((p) => p.id === 'a').job_bonus, 287.86);
  assert.equal(r.totals.revenue, 2000);                       // job revenue lands in the done week
});

test('computeWeek: hours past 40 are paid at time and a half', () => {
  // Ann: 41:59 all production at $20 → 40.00h × 20 + 1.98h × 30 = 800 + 59.40 (hours to 2 decimals, like ADP)
  const row = { days: {}, people: { a: { prod_minutes: 41 * 60 + 59, np_minutes: 0, rate: 20 } } };
  const c = computeWeek({ weekEnding: '2026-10-17', row, weeks: { '2026-10-17': row }, people: [people[0]], jobs: [], targetPct: 30 });
  const ann = c.people.find((p) => p.id === 'a');
  assert.equal(ann.ot_minutes, 119);
  assert.equal(ann.ot_hours, 1.98);
  assert.equal(ann.wages, 859.4);
  assert.equal(ann.prod_wages, 839.67); // straight time only — OT doesn't touch the bonus
});

test('computeWeek: the OT premium is paid but kept out of production wages', () => {
  // Ann: 36h prod + 8h non-prod = 44h at $20; premium = 4h × 10 = 40, none of it on production
  const row = { days: {}, people: { a: { prod_minutes: 36 * 60, np_minutes: 8 * 60, rate: 20 } } };
  const c = computeWeek({ weekEnding: '2026-10-17', row, weeks: { '2026-10-17': row }, people: [people[0]], jobs: [], targetPct: 30 });
  const ann = c.people.find((p) => p.id === 'a');
  assert.equal(ann.wages, 920);
  assert.equal(ann.prod_wages, 720);
});

test('computeWeek: extra bonuses add to pay but not to labor', () => {
  const row = { days: {}, people: { a: { prod_minutes: 600, np_minutes: 0, rate: 20, extras: [{ reason: '5-star review', amount: 25 }, { reason: 'review', amount: 10 }] } } };
  const c = computeWeek({ weekEnding: '2026-10-17', row, weeks: { '2026-10-17': row }, people: [people[0]], jobs: [], targetPct: 30 });
  const ann = c.people.find((p) => p.id === 'a');
  assert.equal(ann.extra_bonus, 35);
  assert.equal(ann.prod_wages, 200);
  assert.equal(ann.total_pay, 200 + ann.week_bonus + 35);
  assert.equal(c.totals.extra_bonus, 35);
});

test('computeWeek: pay matches ADP on the Oct 17 week (hours rounded to 2 decimals)', () => {
  const ppl = [{ id: 'e', name: 'Ethan', hourly_rate: 23, active: true }, { id: 'b', name: 'Braden', hourly_rate: 18, active: true }];
  const row = { days: {}, people: {
    e: { prod_minutes: 41 * 60 + 59, np_minutes: 0, rate: 23 },
    b: { prod_minutes: 39 * 60 + 23, np_minutes: 0, rate: 18 },
  } };
  const c = computeWeek({ weekEnding: '2026-10-17', row, weeks: { '2026-10-17': row }, people: ppl, jobs: [], targetPct: 30 });
  assert.equal(c.people.find((p) => p.id === 'e').wages, 988.31); // ADP: 1,028.43 − 40.12 bonus
  assert.equal(c.people.find((p) => p.id === 'b').wages, 708.84); // ADP: 723.95 − 15.11 bonus
});

/* ─── Christmas lights ─── */
import { lightsTier, isLightsJob, isLightsInstall, computeLights } from '../src/lib/weeklyBonus.js';

test('lights: job titles and tiers', () => {
  assert.ok(isLightsJob('Christmas Lights'));
  assert.ok(isLightsJob('Jane Doe - Lites'));
  assert.ok(!isLightsJob('Jane Doe - Lawn'));
  assert.ok(!isLightsInstall('Christmas Lights Removal'));
  assert.ok(isLightsInstall('Christmas Lights'));
  assert.equal(lightsTier(1999.99), 0);
  assert.equal(lightsTier(2000), 0.01);
  assert.equal(lightsTier(4999), 0.03);
  assert.equal(lightsTier(5000), 0.05);
});

test('lights: the plan example — $5,000 day, equal hours', () => {
  const [d] = computeLights({ '2026-11-10': { jobs: [{ name: 'Christmas Lights', revenue: 5000 }], lights_minutes: { e: 600, i: 600 } } }, 'e');
  assert.equal(d.pool, 250);
  assert.deepEqual(d.shares, { e: 125, i: 125 });
  assert.equal(d.lead, 50);
});

test('lights: lead 1% even under $2,000; removal lines are not install value', () => {
  const [d] = computeLights({ '2026-11-10': { jobs: [{ name: 'Christmas Lights', revenue: 1200 }, { name: 'Lights takedown', revenue: 300 }], lights_minutes: { e: 300 } } }, 'e');
  assert.equal(d.install, 1200);
  assert.equal(d.revenue, 1500);
  assert.equal(d.pool, 0);
  assert.equal(d.lead, 12);
});

test('computeWeek: lights stay out of the lawn pool and are paid at the normal rate + bonuses', () => {
  const ppl = [{ id: 'e', name: 'Ethan', hourly_rate: 18, active: true }, { id: 'i', name: 'Ian', hourly_rate: 16, active: true }];
  const row = {
    days: {
      '2026-11-09': { revenue: 1000, cogs: 0, jobs: [{ name: 'Smith - Lawn', revenue: 1000 }] },
      '2026-11-10': { revenue: 5000, cogs: 100, jobs: [{ name: 'Christmas Lights', revenue: 5000, cogs: 100 }], lights_minutes: { e: 600, i: 600 } },
    },
    people: { e: { prod_minutes: 600, np_minutes: 0, lights_minutes: 600, rate: 18 }, i: { prod_minutes: 600, np_minutes: 0, lights_minutes: 600, rate: 16 } },
  };
  const c = computeWeek({ weekEnding: '2026-11-14', row, weeks: {}, people: ppl, jobs: [], targetPct: 30 });
  // Lawn: $1,000 margin × 30% = $300 allowed − (10h×18 + 10h×16 = $340) → no pool. Lights revenue never enters it.
  assert.equal(c.week.revenue, 1000);
  assert.equal(c.week.pool, 0);
  const e = c.people.find((p) => p.id === 'e'), i = c.people.find((p) => p.id === 'i');
  assert.equal(e.lights_pay, 180);
  assert.equal(e.lights_bonus, 125);
  assert.equal(e.lead_bonus, 50);
  assert.equal(i.lead_bonus, 0);
  assert.equal(e.wages, 360); // 20h × 18, no OT
  assert.equal(e.total_pay, 535);
  assert.equal(c.revenue, 6000); // all-in revenue still recorded
});

test('computeWeek: lights + overtime: normal OT, plus the lights bonus raises the OT rate', () => {
  const ppl = [{ id: 'i', name: 'Ian', hourly_rate: 16, active: true }];
  const row = {
    days: { '2026-11-10': { revenue: 3000, jobs: [{ name: 'Christmas Lights', revenue: 3000 }], lights_minutes: { i: 600 } } },
    people: { i: { prod_minutes: 2400, np_minutes: 0, lights_minutes: 600, rate: 16 } }, // 40h lawn + 10h lights = 50h
  };
  const c = computeWeek({ weekEnding: '2026-11-14', row, weeks: {}, people: ppl, jobs: [], targetPct: 30 });
  const i = c.people[0];
  // 40h × 16 = 640 + 10h × 24 = 240; lights pool 3000×2% = 60 (all to Ian) → OT top-up 10 × ½ × 60/50 = 6
  assert.equal(i.lights_bonus, 60);
  assert.equal(i.reg_pay, 640);
  assert.equal(i.ot_pay, 240);
  assert.equal(i.bonus_ot, 6);
  assert.equal(i.wages, 886);
});

test('computeWeek: weeks before the lights plan keep their original math', () => {
  const ppl = [{ id: 'i', name: 'Ian', hourly_rate: 16, active: true }];
  const row = { days: { '2026-10-28': { revenue: 1200, jobs: [{ name: 'Christmas Lights', revenue: 1200 }] } }, people: { i: { prod_minutes: 600, np_minutes: 0, rate: 16 } } };
  const c = computeWeek({ weekEnding: '2026-10-31', row, weeks: {}, people: ppl, jobs: [], targetPct: 30 });
  assert.equal(c.week.revenue, 1200);
  assert.equal(c.lights.days.length, 0);
});

test('computeWeek: lights labor is split into install days and removal days', () => {
  const ppl = [{ id: 'e', name: 'Ethan', hourly_rate: 23, active: true }, { id: 'b', name: 'Bo', hourly_rate: 18, active: true }];
  const row = {
    days: {
      '2026-11-09': { revenue: 2000, jobs: [{ name: 'Christmas Lights', revenue: 2000 }], lights_minutes: { e: 240, b: 240 } },
      '2026-11-10': { revenue: 0, jobs: [{ name: 'Christmas Lights Removal', revenue: 0 }], lights_minutes: { b: 120 } },
    },
    people: { e: { prod_minutes: 0, np_minutes: 0, lights_minutes: 240, rate: 23 }, b: { prod_minutes: 0, np_minutes: 0, lights_minutes: 360, rate: 18 } },
  };
  const c = computeWeek({ weekEnding: '2026-11-14', row, weeks: {}, people: ppl, jobs: [], targetPct: 30 });
  // install day: 4h×23 + 4h×18 = 164 + pool 20 + lead 20 = 204; removal day: 2h×18 = 36
  assert.equal(c.totals.lights_install, 2000);
  assert.equal(c.totals.lights_install_labor, 204);
  assert.equal(c.totals.lights_removal_labor, 36);
});
