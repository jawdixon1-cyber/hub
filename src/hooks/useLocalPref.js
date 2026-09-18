import { useState, useEffect, useCallback } from 'react';

// Device-local UI preference backed by localStorage.
//
// Why not the app store: these are per-device display choices (which sidebar
// groups you want to see), not org data. Putting them in the Supabase-backed
// store would sync one person's sidebar layout to everyone in the org.
//
// The custom event is what makes the toggle in Settings move the sidebar
// immediately — a plain localStorage write doesn't re-render anything, and the
// native `storage` event only fires in *other* tabs, never the one that wrote.

const EVENT = 'local-pref-change';

export function readLocalPref(key, fallback = false) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
}

export function useLocalPref(key, fallback = false) {
  const [value, setValue] = useState(() => readLocalPref(key, fallback));

  // Stay in sync with writes from other components (same tab) and other tabs.
  useEffect(() => {
    const sync = (e) => {
      if (e.type === EVENT && e.detail !== key) return;
      if (e.type === 'storage' && e.key !== key) return;
      setValue(readLocalPref(key, fallback));
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [key, fallback]);

  // The write and the dispatch stay OUT of the setState updater. Dispatching
  // inside one re-enters this hook's own listener mid-update, React re-runs the
  // queue, and a `v => !v` updater flips a second time — the toggle snaps back.
  const update = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(value) : next;
    try { localStorage.setItem(key, String(resolved)); } catch { /* private mode / quota — keep the in-memory value */ }
    setValue(resolved);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
  }, [key, value]);

  return [value, update];
}

// Preference keys — keep them here so App and Settings can't drift apart.
export const PREF_HIDE_BUILDING = 'sidebar-hide-building';
export const PREF_HIDE_SCHEDULE = 'sidebar-hide-schedule';

// Everything the Appearance settings pane offers to hide. Adding a row here is
// all it takes to make another part of the sidebar toggleable — Settings renders
// straight off this list, so the two can't fall out of sync.
export const SIDEBAR_TOGGLES = [
  {
    key: PREF_HIDE_BUILDING,
    label: 'Building',
    description:
      'The sidebar group holding Clients, Quotes, Invoices and the other CRM modules.',
  },
  {
    key: PREF_HIDE_SCHEDULE,
    label: 'Schedule',
    description: 'The Schedule link at the top of the sidebar, under Home.',
  },
];
