/* ─── Money: integer cents everywhere ───
 * Postgres stores numeric(10,2). The app converts at the edge with toCents()
 * and back with toDollars(). Nothing in the engine touches a float dollar. */

/** "20.50" | 20.5 | null → 2050 */
export function toCents(v) {
  if (v === null || v === undefined || v === '') return 0;
  const s = String(v).trim().replace(/[$,\s]/g, '');
  const neg = s.startsWith('-');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  const cents = (parseInt(whole || '0', 10) * 100) + parseInt((frac + '00').slice(0, 2), 10);
  if (Number.isNaN(cents)) return 0;
  return neg ? -cents : cents;
}

/** 2050 → 20.5 (for writing numeric(10,2)) */
export const toDollars = (c) => Math.round(c) / 100;

/** 2050 → "$20.50"; negatives as "-$20.50" */
export function fmt(c) {
  const n = Math.round(c || 0);
  const abs = Math.abs(n);
  const s = `$${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
  return n < 0 ? `-${s}` : s;
}

/** hours are stored to 0.01; represent as hundredths internally */
export const toHundredths = (h) => Math.round(Number(h || 0) * 100);
export const fromHundredths = (hh) => hh / 100;
export const fmtHours = (hh) => (hh / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1') + 'h';

/** hours(hundredths) × rate(cents) → cents, rounded half-up */
export function laborCents(hoursHundredths, rateCents) {
  return Math.round((hoursHundredths * rateCents) / 100);
}

/** pct as a number like 30 or 30.5 → basis points (3000 / 3050) */
export const pctToBps = (p) => Math.round(Number(p || 0) * 100);

/** cents × bps → cents, rounded half-up */
export function applyBps(cents, bps) {
  return Math.round((cents * bps) / 10000);
}

/** Split `total` cents across weights so the parts sum exactly to total (largest remainder). */
export function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (remainder <= 0) break; floors[i] += 1; remainder -= 1; }
  return floors;
}
