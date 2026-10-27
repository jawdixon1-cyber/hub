/* ─── Weekly bonus math ───
 * Pure functions, no I/O. Minutes in, dollars out.
 *
 * Every week: labor % = production wages ÷ (revenue − COGS). Under the
 * target, the gap is a pool split by production minutes. Hours on unfinished
 * jobs are paid but held out of that math.
 *
 * An unfinished job carries per-person minutes, COGS and payments week to week. The week
 * it's done it gets its own calc over every week it touched (same rule), and
 * its pool is split by each person's minutes on the job. Rates come from the
 * week row's snapshot so old weeks never move. */

const r2 = (n) => Math.round(n * 100) / 100;
const wage = (minutes, rate) => (minutes / 60) * rate;
// Overtime: hours past 40 in the week are paid at time and a half.
export const OT_AFTER_MINUTES = 40 * 60;
const payHours = (minutes) => Math.round((minutes / 60) * 100) / 100; // payroll hours, 2 decimals

/** Split `pool` by `weights` ({id: minutes}); last share absorbs rounding. */
export function splitPool(pool, weights) {
  const ids = Object.keys(weights).filter((id) => weights[id] > 0);
  const total = ids.reduce((s, id) => s + weights[id], 0);
  if (pool <= 0 || total <= 0) return {};
  const out = {}; let given = 0;
  ids.forEach((id, i) => {
    const share = i === ids.length - 1 ? r2(pool - given) : r2((pool * weights[id]) / total);
    out[id] = share; given += share;
  });
  return out;
}

/** Bonus pool for one bucket of work. */
export function bonusFor({ revenue, cogs, prodWages, targetPct }) {
  const margin = revenue - cogs;
  const laborPct = margin > 0 ? prodWages / margin : null;
  const pool = margin > 0 ? Math.max(0, r2(margin * (targetPct / 100) - prodWages)) : 0;
  return { revenue, cogs, margin, prodWages: r2(prodWages), laborPct, pool, under: laborPct != null && laborPct <= targetPct / 100 };
}

/** Rate for a person in a given week: the week row's snapshot, else current. */
function rateFor(weeks, people, weekEnding, pid) {
  const snap = weeks[weekEnding]?.people?.[pid]?.rate;
  if (snap != null) return Number(snap) || 0;
  return Number(people.find((p) => p.id === pid)?.hourly_rate) || 0;
}

/** Full calc for a job across every week it touched. */
export function computeJob(job, { weeks, people, targetPct }) {
  const byPerson = {}; let prodWages = 0, cogs = 0, minutes = 0, paid = 0;
  const perWeek = [];
  for (const [w, h] of Object.entries(job.holds || {})) {
    let wMin = 0, wWages = 0;
    for (const [pid, m] of Object.entries(h.people || {})) {
      const min = Number(m) || 0; if (!min) continue;
      const wg = wage(min, rateFor(weeks, people, w, pid));
      byPerson[pid] = { minutes: (byPerson[pid]?.minutes || 0) + min, wages: (byPerson[pid]?.wages || 0) + wg };
      wMin += min; wWages += wg;
    }
    const c = Number(h.cogs) || 0, pd = Number(h.revenue) || 0;
    perWeek.push({ week_ending: w, minutes: wMin, wages: r2(wWages), cogs: c, paid: pd });
    prodWages += wWages; cogs += c; minutes += wMin; paid += pd;
  }
  // Job revenue = everything paid on it across the weeks (+ any legacy lump on the row).
  const revenue = r2(paid + (Number(job.revenue) || 0));
  const calc = bonusFor({ revenue, cogs, prodWages, targetPct });
  const shares = splitPool(calc.pool, Object.fromEntries(Object.entries(byPerson).map(([pid, v]) => [pid, v.minutes])));
  // Revenue share per week, pro-rata by minutes — for the records, not the payout.
  perWeek.sort((a, b) => a.week_ending.localeCompare(b.week_ending));
  for (const pw of perWeek) pw.revenueShare = minutes > 0 ? r2((revenue * pw.minutes) / minutes) : 0;
  return { id: job.id, name: job.name, done: !!job.done_week, done_week: job.done_week, ...calc, minutes, byPerson, shares, perWeek };
}

/**
 * Everything for one week.
 * @param weekEnding  'YYYY-MM-DD'
 * @param row         the weekly_log row for this week (may be null/partial)
 * @param weeks       { week_ending: row } for rate snapshots of past weeks
 * @param people      current people list [{id, name, hourly_rate, active}]
 * @param jobs        all weekly_log_jobs rows
 * @param targetPct   e.g. 30
 */
export function computeWeek({ weekEnding, row, weeks, people, jobs, targetPct, feePct = 0 }) {
  const days = row?.days || {};
  const revenue = Object.values(days).reduce((s, d) => s + (Number(d.revenue) || 0), 0);
  // Processing fees are built into our prices, so they count in COGS as a % of finished revenue.
  const fees = r2(revenue * (Number(feePct) || 0) / 100);
  const cogs = Object.values(days).reduce((s, d) => s + (Number(d.cogs) || 0), 0) + fees;

  // Hours on unfinished jobs this week, per person (paid, but not production).
  const jobMinutes = {};
  for (const j of jobs) for (const [pid, m] of Object.entries(j.holds?.[weekEnding]?.people || {})) jobMinutes[pid] = (jobMinutes[pid] || 0) + (Number(m) || 0);

  // Current roster, plus anyone who only exists in this week's snapshot (left the team since).
  const snapOnly = Object.entries(row?.people || {}).filter(([pid]) => !people.some((p) => p.id === pid)).map(([pid, e]) => ({ id: pid, name: e.name || pid, hourly_rate: e.rate, active: false }));
  const rows = [...people.filter((p) => p.active || row?.people?.[p.id]), ...snapOnly].map((p) => {
    const e = row?.people?.[p.id] || {};
    const rate = e.rate != null ? Number(e.rate) : Number(p.hourly_rate) || 0;
    const prod = Number(e.prod_minutes) || 0, np = Number(e.np_minutes) || 0, onJobs = jobMinutes[p.id] || 0;
    const total = prod + np + onJobs;
    // Pay is figured the way ADP does it: hours rounded to 2 decimals, regular
    // up to 40 at the rate, the rest at time and a half. The OT premium stays
    // out of production wages so overtime never shrinks the bonus.
    const regH = payHours(Math.min(total, OT_AFTER_MINUTES)), otH = payHours(Math.max(0, total - OT_AFTER_MINUTES));
    const regPay = r2(regH * rate), otPay = r2(otH * rate * 1.5);
    return { id: p.id, name: p.name, rate, prod_minutes: prod, np_minutes: np, job_minutes: onJobs, total_minutes: total,
      ot_minutes: Math.max(0, total - OT_AFTER_MINUTES), reg_hours: regH, ot_hours: otH, reg_pay: regPay, ot_pay: otPay, ot_premium: r2(otH * rate * 0.5),
      prod_wages: r2(wage(prod, rate)), wages: r2(regPay + otPay) };
  });

  const week = bonusFor({ revenue, cogs, prodWages: rows.reduce((s, p) => s + p.prod_wages, 0), targetPct });
  const weekShares = splitPool(week.pool, Object.fromEntries(rows.map((p) => [p.id, p.prod_minutes])));

  const doneJobs = jobs.filter((j) => j.done_week === weekEnding).map((j) => computeJob(j, { weeks, people, targetPct }));
  const openJobs = jobs.filter((j) => !j.done_week || j.done_week > weekEnding).filter((j) => j.opened_week <= weekEnding).map((j) => computeJob(j, { weeks, people, targetPct }));

  for (const p of rows) {
    p.week_bonus = weekShares[p.id] || 0;
    p.job_bonus = r2(doneJobs.reduce((s, j) => s + (j.shares[p.id] || 0), 0));
    // Extra bonuses (reviews etc.) are added by hand; they're pay, not production labor.
    p.extras = (row?.people?.[p.id]?.extras || []).filter((e) => Number(e.amount));
    p.extra_bonus = r2(p.extras.reduce((s, e) => s + Number(e.amount), 0));
    p.bonus = r2(p.week_bonus + p.job_bonus + p.extra_bonus);
    p.total_pay = r2(p.wages + p.bonus);
  }
  const sum = (k) => r2(rows.reduce((s, p) => s + p[k], 0));
  const jobsRevenue = r2(doneJobs.reduce((s, j) => s + j.revenue, 0));
  const jobsCogs = r2(doneJobs.reduce((s, j) => s + j.cogs, 0));
  const jobsProdWages = r2(doneJobs.reduce((s, j) => s + j.prodWages, 0));
  return {
    weekEnding, targetPct, feePct: Number(feePct) || 0, fees, revenue, cogs, people: rows, week, weekShares, doneJobs, openJobs,
    totals: {
      revenue: r2(revenue + jobsRevenue), cogs: r2(cogs + jobsCogs), jobsRevenue, jobsCogs, jobsProdWages,
      all_prod_wages: r2(rows.reduce((s, p) => s + p.prod_wages, 0) + jobsProdWages), // week + finished jobs, for all-in labor %
      prod_minutes: rows.reduce((s, p) => s + p.prod_minutes, 0), np_minutes: rows.reduce((s, p) => s + p.np_minutes, 0),
      job_minutes: rows.reduce((s, p) => s + p.job_minutes, 0), total_minutes: rows.reduce((s, p) => s + p.total_minutes, 0),
      wages: sum('wages'), prod_wages: sum('prod_wages'), week_bonus: sum('week_bonus'), job_bonus: sum('job_bonus'), extra_bonus: sum('extra_bonus'), bonus: sum('bonus'), total_pay: sum('total_pay'),
      employer_taxes: r2(Number(row?.employer_taxes) || 0),
    },
  };
}
