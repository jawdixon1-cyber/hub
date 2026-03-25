const TZ_STORAGE_KEY = 'greenteam-timezone';
const DEFAULT_TZ = 'America/New_York';

/**
 * Get the configured timezone from localStorage, or fall back to Eastern Time.
 */
export function getTimezone() {
  return localStorage.getItem(TZ_STORAGE_KEY) || DEFAULT_TZ;
}

/**
 * Get today's date string (YYYY-MM-DD) in the configured timezone.
 */
export function getTodayInTimezone() {
  const tz = getTimezone();
  const now = new Date();

  // Format the date in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // en-CA locale gives us YYYY-MM-DD format
  return formatter.format(now);
}

/**
 * Get a YYYY-MM-DD string for any Date object in the configured timezone.
 */
export function toDateStringInTimezone(date) {
  const tz = getTimezone();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Get current ISO timestamp adjusted for display purposes.
 * (Still returns full ISO string, but can be used alongside getTodayInTimezone)
 */
export function getNowISO() {
  return new Date().toISOString();
}
