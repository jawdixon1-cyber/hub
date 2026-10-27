/* h:mm ↔ minutes ↔ decimal hours for the weekly log. Minutes are the stored unit. */

// Accepts "7:30", "7.5", "7", "7h 30m", "45m". Returns whole minutes, or null if unreadable.
export function parseTime(str) {
  const s = String(str ?? '').trim().toLowerCase();
  if (!s) return 0;
  let m;
  if ((m = s.match(/^(\d+):([0-5]?\d)$/))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = s.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/)) && (m[1] || m[2])) return Number(m[1] || 0) * 60 + Number(m[2] || 0);
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 60);
  return null;
}
export const minutesToHMM = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
export const minutesToDecimal = (min) => (min / 60).toFixed(2);
