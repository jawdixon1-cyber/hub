import { getTodayInTimezone } from './timezone';

/* ── Level System ── */

export const LEVELS = [
  { name: 'Rookie',  minXP: 0,     color: 'text-gray-600',    bg: 'bg-gray-100 dark:bg-gray-800',       bar: 'from-gray-400 to-gray-500',     icon: '🌱' },
  { name: 'Crew',    minXP: 500,   color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/40', bar: 'from-emerald-400 to-emerald-600', icon: '⚡' },
  { name: 'Pro',     minXP: 2000,  color: 'text-blue-600',    bg: 'bg-blue-100 dark:bg-blue-900/40',     bar: 'from-blue-400 to-blue-600',     icon: '🔥' },
  { name: 'Elite',   minXP: 5000,  color: 'text-purple-600',  bg: 'bg-purple-100 dark:bg-purple-900/40', bar: 'from-purple-400 to-purple-600', icon: '💎' },
  { name: 'Legend',  minXP: 10000, color: 'text-amber-600',   bg: 'bg-amber-100 dark:bg-amber-900/40',   bar: 'from-amber-400 to-amber-600',   icon: '👑' },
];

export function calculateLevel(totalXP) {
  let current = LEVELS[0];
  let nextLevel = LEVELS[1];

  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalXP >= LEVELS[i].minXP) {
      current = LEVELS[i];
      nextLevel = LEVELS[i + 1] || null;
      break;
    }
  }

  const xpIntoLevel = totalXP - current.minXP;
  const xpForNext = nextLevel ? nextLevel.minXP - current.minXP : 1;
  const progress = nextLevel ? Math.min((xpIntoLevel / xpForNext) * 100, 100) : 100;

  return {
    name: current.name,
    icon: current.icon,
    color: current.color,
    bg: current.bg,
    bar: current.bar,
    progress,
    xpIntoLevel,
    xpForNext: nextLevel ? nextLevel.minXP - current.minXP : 0,
    nextLevelName: nextLevel?.name || null,
    isMax: !nextLevel,
  };
}

/* ── Period Logic ── */

export function getCurrentPeriod(type) {
  const today = getTodayInTimezone(); // YYYY-MM-DD

  if (type === 'daily') return today;

  if (type === 'weekly') {
    const d = new Date(today + 'T00:00:00');
    const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 86400000);
    const weekNum = Math.ceil((dayOfYear + new Date(d.getFullYear(), 0, 1).getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  if (type === 'monthly') return today.slice(0, 7); // YYYY-MM

  return 'bounty'; // bounties have no period
}

/* ── Completion Checks ── */

export function hasCompletedInPeriod(completions, questId, userEmail, period) {
  return completions.some(
    (c) => c.questId === questId && c.completedBy === userEmail && c.period === period
  );
}

export function getTeamCompletionCount(completions, questId, period) {
  const unique = new Set();
  for (const c of completions) {
    if (c.questId === questId && c.period === period) {
      unique.add(c.completedBy);
    }
  }
  return unique.size;
}

export function isQuestAvailable(quest) {
  if (!quest.active) return false;
  if (quest.type === 'bounty' && quest.expiresAt) {
    const today = getTodayInTimezone();
    return today <= quest.expiresAt;
  }
  return true;
}

/* ── Streak Calculation ── */

export function calculateStreak(completions, userEmail) {
  // Get unique completion dates for this user, sorted descending
  const dates = [...new Set(
    completions
      .filter((c) => c.completedBy === userEmail)
      .map((c) => c.completedAt?.slice(0, 10))
      .filter(Boolean)
  )].sort().reverse();

  if (dates.length === 0) return 0;

  const today = getTodayInTimezone();
  let streak = 0;
  let expected = today;

  // Allow today or yesterday as the start
  if (dates[0] !== today) {
    const yesterday = shiftDate(today, -1);
    if (dates[0] !== yesterday) return 0;
    expected = yesterday;
  }

  for (const date of dates) {
    if (date === expected) {
      streak++;
      expected = shiftDate(expected, -1);
    } else if (date < expected) {
      break;
    }
  }

  return streak;
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
