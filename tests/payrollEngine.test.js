import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeWeek, weekEndingFor } from '../src/lib/payroll/engine.js';
import { toCents, allocate, laborCents, fmt } from '../src/lib/payroll/money.js';

const RATE = 20.5;
const settings = { target_pct: 30, allocation_method: 'production_hours_share' };
const employees = [
  { id: 'braden', name: 'Braden', active: true, hourly_rate: RATE },
  { id: 'ethan', name: 'Ethan', active: true, hourly_rate: RATE },
];
const W1 = '2026-09-13', W2 = '2026-09-20';
const te = (id, employee_id, job_id, worked_on, week_ending, hours, kind = 'production') =>
  ({ id, employee_id, job_id, worked_on, week_ending, hours, kind, hourly_rate_snapshot: RATE });

test('money helpers are exact', () => {
  assert.equal(toCents('20.50'), 2050);
  assert.equal(toCents(2000), 200000);
  assert.equal(toCents('$1,234.56'), 123456);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(laborCents(1700, 2050), 34850); // 17h × $20.50
  assert.equal(fmt(34850), '$348.50');
  assert.deepEqual(allocate(25150, [800, 900]), [11835, 13315]);
  assert.equal(11835 + 13315, 25150);
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
});

test('week 1: WIP job pays base wages but stays out of the bonus', () => {
  const jobs = [{ id: 'A', name: 'Project A', revenue: 2000, cog: 0, status: 'wip', bonus_week_ending: null }];
  const timeEntries = [te('1', 'braden', 'A', '2026-09-08', W1, 5), te('2', 'ethan', 'A', '2026-09-08', W1, 5)];
  const r = computeWeek({ weekEnding: W1, employees, jobs, timeEntries, payItems: [], settings });

  const b = r.employees.find((e) => e.name === 'Braden'), e = r.employees.find((x) => x.name === 'Ethan');
  assert.equal(b.base_wages, 10250);          // 5 × $20.50 — paid now
  assert.equal(e.base_wages, 10250);
  assert.equal(b.production_hours, 500);
  assert.equal(r.completed.revenue, 0);       // revenue held
  assert.equal(r.completed.hours, 0);         // labor held
  assert.equal(r.completed.pool, 0);
  assert.equal(b.production_bonus, 0);
  assert.equal(r.wip.count, 1);
  assert.equal(r.wip.adjusted, 200000);
  assert.equal(r.wip.hours, 1000);
  assert.equal(r.wip.labor, 20500);
});

test('week 2: job completes — full revenue and ALL prior labor evaluated as one job', () => {
  const jobs = [{ id: 'A', name: 'Project A', revenue: 2000, cog: 0, status: 'complete', completed_on: '2026-09-16', bonus_week_ending: W2, bonus_processed_run_id: null }];
  const timeEntries = [
    te('1', 'braden', 'A', '2026-09-08', W1, 5), te('2', 'ethan', 'A', '2026-09-08', W1, 5),
    te('3', 'braden', 'A', '2026-09-16', W2, 3), te('4', 'ethan', 'A', '2026-09-16', W2, 4),
  ];
  const r = computeWeek({ weekEnding: W2, employees, jobs, timeEntries, payItems: [], settings });
  const b = r.employees.find((x) => x.name === 'Braden'), e = r.employees.find((x) => x.name === 'Ethan');

  // base pay is only week 2 hours
  assert.equal(b.base_wages, 6150);           // 3 × 20.50
  assert.equal(e.base_wages, 8200);           // 4 × 20.50
  // bonus uses all 17 hours across both weeks
  assert.equal(r.completed.hours, 1700);
  assert.equal(r.completed.labor, 34850);
  assert.equal(r.completed.adjusted, 200000);
  assert.equal(r.completed.targetBudget, 60000);
  assert.equal(r.completed.pool, 25150);
  assert.equal(r.completed.laborPctBps, 1743); // 17.43%
  assert.equal(b.eligible_hours, 800);
  assert.equal(e.eligible_hours, 900);
  assert.equal(b.production_bonus, 11835);    // 251.50 × 8/17
  assert.equal(e.production_bonus, 13315);    // 251.50 × 9/17
  assert.equal(b.production_bonus + e.production_bonus, r.completed.pool);
  assert.equal(r.completed.jobs[0].beatTarget, true);
  assert.equal(r.wip.count, 0);
});

test('at or above target → zero pool, never negative', () => {
  const jobs = [{ id: 'B', name: 'Cheap job', revenue: 500, cog: 100, status: 'complete', bonus_week_ending: W1 }];
  const timeEntries = [te('1', 'braden', 'B', '2026-09-08', W1, 10)]; // $205 labor vs $120 target
  const r = computeWeek({ weekEnding: W1, employees, jobs, timeEntries, payItems: [], settings });
  assert.equal(r.completed.targetBudget, 12000);
  assert.equal(r.completed.labor, 20500);
  assert.equal(r.completed.pool, 0);
  assert.equal(r.employees.find((x) => x.name === 'Braden').production_bonus, 0);
  assert.equal(r.completed.jobs[0].beatTarget, false);
});

test('a job already processed by another run is excluded (no double bonus)', () => {
  const jobs = [{ id: 'A', name: 'Project A', revenue: 2000, cog: 0, status: 'complete', bonus_week_ending: W2, bonus_processed_run_id: 'run-earlier' }];
  const timeEntries = [te('3', 'braden', 'A', '2026-09-16', W2, 3)];
  const r = computeWeek({ weekEnding: W2, runId: 'run-now', employees, jobs, timeEntries, payItems: [], settings });
  assert.equal(r.completed.revenue, 0);
  assert.equal(r.completed.pool, 0);
  assert.ok(r.warnings.some((w) => w.code === 'already_processed'));
  // same job, same run id → still eligible (re-computing our own draft)
  const r2 = computeWeek({ weekEnding: W2, runId: 'run-earlier', employees, jobs, timeEntries, payItems: [], settings });
  assert.equal(r2.completed.revenue, 200000);
});

test('completed in a prior week but never run → carried forward with a flag', () => {
  const jobs = [{ id: 'A', name: 'Project A', revenue: 1000, cog: 0, status: 'complete', bonus_week_ending: W1, bonus_processed_run_id: null }];
  const timeEntries = [te('1', 'braden', 'A', '2026-09-08', W1, 4)];
  const r = computeWeek({ weekEnding: W2, employees, jobs, timeEntries, payItems: [], settings });
  assert.equal(r.completed.revenue, 100000);
  assert.ok(r.warnings.some((w) => w.code === 'carried_forward'));
});

test('pay items: bonuses in gross, reimbursements separate, paid items excluded', () => {
  const payItems = [
    { id: 'p1', employee_id: 'braden', type: 'review_bonus', amount: 25, description: 'Google review', week_ending: W1 },
    { id: 'p2', employee_id: 'braden', type: 'reimbursement', amount: 40, description: 'Gas', week_ending: W1 },
    { id: 'p3', employee_id: 'braden', type: 'correction', amount: -10, description: 'Overpaid last week', week_ending: W1 },
    { id: 'p4', employee_id: 'braden', type: 'other_bonus', amount: 99, description: 'already paid', week_ending: W1, paid_run_id: 'old' },
  ];
  const timeEntries = [te('1', 'braden', null, '2026-09-08', W1, 2, 'non_production')];
  const r = computeWeek({ weekEnding: W1, employees, jobs: [], timeEntries, payItems, settings });
  const b = r.employees.find((x) => x.name === 'Braden');
  assert.equal(b.base_wages, 4100);
  assert.equal(b.other_bonuses, 2500);
  assert.equal(b.corrections, -1000);
  assert.equal(b.reimbursements, 4000);
  assert.equal(b.gross, 4100 + 2500 - 1000);
  assert.equal(b.payout, b.gross + 4000);
  assert.ok(r.warnings.some((w) => w.code === 'item_already_paid'));
  assert.deepEqual(r.payItemIds.sort(), ['p1', 'p2', 'p3']);
});

test('validation warnings fire', () => {
  const jobs = [{ id: 'Z', name: 'Zero', revenue: 0, cog: 0, status: 'complete', bonus_week_ending: W1 }];
  const emps = [...employees, { id: 'gone', name: 'Old Guy', active: false, hourly_rate: RATE }];
  const timeEntries = [te('1', 'gone', null, '2026-09-08', W1, 3), te('2', 'braden', 'Z', '2026-09-08', W1, 1)];
  const r = computeWeek({ weekEnding: W1, employees: emps, jobs, timeEntries, payItems: [], settings });
  const codes = r.warnings.map((w) => w.code);
  assert.ok(codes.includes('complete_no_revenue'));
  assert.ok(codes.includes('inactive_emp'));
  assert.ok(codes.includes('prod_no_job'));
  assert.ok(r.employees.find((x) => x.name === 'Ethan').flags.includes('0 hours this week'));
});

test('weekEndingFor rolls forward to the configured day', () => {
  assert.equal(weekEndingFor('2026-09-16', 0), '2026-09-20'); // Wed → Sun
  assert.equal(weekEndingFor('2026-09-20', 0), '2026-09-20'); // Sun stays
  assert.equal(weekEndingFor('2026-09-16', 5), '2026-09-18'); // Wed → Fri
});
