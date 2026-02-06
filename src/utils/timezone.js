const TZ_STORAGE_KEY = 'greenteam-timezone';

/**
 * Get the configured timezone from localStorage, or fall back to device default.
 */
export function getTimezone() {
  return localStorage.getItem(TZ_STORAGE_KEY) || Intl.DateTimeFormat().resolvedOptions().timeZone;
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
 * Get current ISO timestamp adjusted for display purposes.
 * (Still returns full ISO string, but can be used alongside getTodayInTimezone)
 */
export function getNowISO() {
  return new Date().toISOString();
}
