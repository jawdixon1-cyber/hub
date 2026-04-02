import { createStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

import {
  initialAnnouncements,
  initialGuides,
  initialFieldOpsGuides,
  initialGMGuides,
  initialPMEGuides,
  initialEquipment,
  initialIdeas,
  initialPolicies,
  initialTimeOffRequests,
  initialOwnerStartChecklist,
  initialOwnerEndChecklist,
  initialVehicles,
  initialMileageLog,
  initialEquipmentRepairLog,
  initialTeamChecklist,
  initialTeamEndChecklist,
  initialChecklistLog,
  initialQuests,
  initialQuotes,
  initialQuotingSettings,
  initialReceiptLog,
  initialQuizLog,
  initialMowingSettings,
  initialMowingNotifications,
} from '../data';

const DATA_CACHE_KEY = 'greenteam-data-cache';

const STATE_KEYS = [
  { key: 'permissions',           supaKey: 'greenteam-permissions',           initial: {} },
  { key: 'announcements',         supaKey: 'greenteam-announcements',         initial: initialAnnouncements },
  { key: 'ownerTodos',            supaKey: 'greenteam-ownerTodos',            initial: [] },
  { key: 'ownerStartChecklist',   supaKey: 'greenteam-ownerStartChecklist',   initial: initialOwnerStartChecklist },
  { key: 'ownerEndChecklist',     supaKey: 'greenteam-ownerEndChecklist',     initial: initialOwnerEndChecklist },
  { key: 'guides',                supaKey: 'greenteam-guides',                initial: [...initialGuides, ...initialFieldOpsGuides, ...initialPMEGuides, ...initialGMGuides] },
  { key: 'equipment',             supaKey: 'greenteam-equipment',             initial: initialEquipment },
  { key: 'policies',              supaKey: 'greenteam-policies',              initial: initialPolicies },
  { key: 'timeOffRequests',       supaKey: 'greenteam-timeOffRequests',       initial: initialTimeOffRequests },
  { key: 'archivedAnnouncements', supaKey: 'greenteam-archivedAnnouncements', initial: [] },
  { key: 'equipmentRepairLog',    supaKey: 'greenteam-equipmentRepairLog',    initial: initialEquipmentRepairLog },
  { key: 'teamChecklist',         supaKey: 'greenteam-teamChecklist',         initial: initialTeamChecklist },
  { key: 'suggestions',           supaKey: 'greenteam-suggestions',           initial: initialIdeas },
  { key: 'teamEndChecklist',      supaKey: 'greenteam-teamEndChecklist',      initial: initialTeamEndChecklist },
  { key: 'checklistLog',          supaKey: 'greenteam-checklistLog',          initial: initialChecklistLog },
  { key: 'trainingConfig',        supaKey: 'greenteam-trainingConfig',        initial: {} },
  { key: 'equipmentCategories',  supaKey: 'greenteam-equipmentCategories',  initial: [] },
  { key: 'customModules',        supaKey: 'greenteam-customModules',        initial: [] },
  { key: 'quests',              supaKey: 'greenteam-quests',              initial: initialQuests },
  { key: 'questCompletions',    supaKey: 'greenteam-questCompletions',    initial: [] },
  { key: 'userXP',              supaKey: 'greenteam-userXP',              initial: {} },
  { key: 'vehicles',            supaKey: 'greenteam-vehicles',            initial: initialVehicles },
  { key: 'mileageLog',          supaKey: 'greenteam-mileageLog',          initial: initialMileageLog },
  { key: 'agreements',           supaKey: 'greenteam-agreements',           initial: [] },
  { key: 'strikes',              supaKey: 'greenteam-strikes',              initial: [] },
  { key: 'signedAgreements',    supaKey: 'greenteam-signedAgreements',    initial: [] },
  { key: 'agreementConfig',    supaKey: 'greenteam-agreementConfig',    initial: null },
  { key: 'presence',             supaKey: 'greenteam-presence',             initial: {} },
  { key: 'quotes',              supaKey: 'greenteam-quotes',              initial: initialQuotes },
  { key: 'quotingSettings',     supaKey: 'greenteam-quotingSettings',     initial: initialQuotingSettings },
  { key: 'receiptLog',          supaKey: 'greenteam-receiptLog',          initial: initialReceiptLog },
  { key: 'ownerNotes',          supaKey: 'greenteam-ownerNotes',          initial: '' },
  { key: 'ownerSchedule',       supaKey: 'greenteam-ownerSchedule',       initial: { sales: { start: '07:00', end: '09:00' }, build: { start: '09:00', end: '11:00' }, delegate: { start: '11:00', end: '12:00' } } },
  { key: 'executionDashboard',  supaKey: 'greenteam-executionDashboard',  initial: null },
  { key: 'executionHistory',    supaKey: 'greenteam-executionHistory',    initial: [] },
  { key: 'quizLog',             supaKey: 'greenteam-quizLog',             initial: initialQuizLog },
  { key: 'mowingSettings',      supaKey: 'greenteam-mowingSettings',      initial: initialMowingSettings },
  { key: 'mowingNotifications', supaKey: 'greenteam-mowingNotifications', initial: initialMowingNotifications },
  { key: 'strikes',             supaKey: 'greenteam-strikes',             initial: [] },
  { key: 'clients',             supaKey: 'greenteam-clients',             initial: [] },
];

function resolveInitial(cloudValue, initial) {
  if (cloudValue !== undefined && cloudValue !== null) {
    return cloudValue;
  }
  return initial;
}

// IDs of guides that should always be seeded into existing data
const SEED_GUIDE_IDS = ['gm-standards-playbook', 'gm-weekly-team-meeting', 'gm-onboarding-new-hire', 'gm-hard-conversations', 'gm-morning-routine', 'gm-weekly-closeout', 'gm-sales-door-approach', 'gm-sales-on-site-closing', 'gm-sales-psychology'];

function seedMissingGuides(guides, allInitialGuides) {
  const existingIds = new Set(guides.map((g) => g.id));
  const missing = allInitialGuides.filter((g) => SEED_GUIDE_IDS.includes(g.id) && !existingIds.has(g.id));
  return missing.length > 0 ? [...guides, ...missing] : guides;
}

export function createAppStore(cloudData) {
  const allInitialGuides = [...initialGuides, ...initialFieldOpsGuides, ...initialPMEGuides, ...initialGMGuides];
  const initialState = {};
  for (const { key, supaKey, initial } of STATE_KEYS) {
    let value = resolveInitial(cloudData[supaKey], initial);
    // Seed any new default guides into existing cloud data
    if (key === 'guides' && Array.isArray(value)) {
      value = seedMissingGuides(value, allInitialGuides);
    }
    initialState[key] = value;
  }

  // Track which keys the user has modified locally since store creation
  const dirtyKeys = new Set();

  const store = createStore(
    subscribeWithSelector((set) => {
      const setters = {};
      for (const { key } of STATE_KEYS) {
        const setterName = 'set' + key[0].toUpperCase() + key.slice(1);
        setters[setterName] = (valOrFn) => {
          dirtyKeys.add(key);
          set((state) => ({
            [key]: typeof valOrFn === 'function' ? valOrFn(state[key]) : valOrFn,
          }));
        };
      }
      return { ...initialState, ...setters };
    })
  );

  // Single debounced subscriber that persists changed keys
  let debounceTimer = null;
  let changedKeys = new Set();

  for (const { key, supaKey } of STATE_KEYS) {
    store.subscribe(
      (state) => state[key],
      (value, prev) => {
        if (value === prev) return;
        changedKeys.add(supaKey);

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const state = store.getState();
          const keysToSync = [...changedKeys];
          changedKeys = new Set();

          // Persist to localStorage
          try {
            const cached = JSON.parse(localStorage.getItem(DATA_CACHE_KEY) || '{}');
            for (const sk of keysToSync) {
              const entry = STATE_KEYS.find((e) => e.supaKey === sk);
              if (entry) cached[sk] = state[entry.key];
            }
            localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(cached));
          } catch (e) {
            console.warn('[appStore] localStorage save failed:', e.name, e.message);
            // If quota exceeded, try clearing old cache and saving just changed keys
            if (e.name === 'QuotaExceededError') {
              try {
                const fresh = {};
                for (const sk of keysToSync) {
                  const entry = STATE_KEYS.find((en) => en.supaKey === sk);
                  if (entry) fresh[sk] = state[entry.key];
                }
                localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(fresh));
              } catch {}
            }
          }

          // Persist to Supabase (retry once on failure)
          for (const sk of keysToSync) {
            const entry = STATE_KEYS.find((e) => e.supaKey === sk);
            if (entry) {
              const payload = { key: sk, value: state[entry.key] };
              supabase
                .from('app_state')
                .upsert(payload, { onConflict: 'key' })
                .then(({ error }) => {
                  if (error) {
                    console.warn('[appStore] Supabase sync failed for', sk, '— retrying…', error.message);
                    setTimeout(() => {
                      supabase.from('app_state').upsert(payload, { onConflict: 'key' }).catch(() => {});
                    }, 2000);
                  }
                })
                .catch((err) => {
                  console.warn('[appStore] Supabase sync error for', sk, err);
                });
            }
          }
        }, 500);
      }
    );
  }

  // Hydrate from fresh cloud data (called when Supabase fetch completes)
  store.hydrateFromCloud = (cloudData) => {
    const state = store.getState();
    const updates = {};
    for (const { key, supaKey, initial } of STATE_KEYS) {
      // Skip keys the user has already modified locally — don't overwrite their edits
      if (dirtyKeys.has(key)) continue;
      let cloudValue = cloudData[supaKey];
      if (cloudValue !== undefined && cloudValue !== null) {
        // Seed any new default guides into cloud data
        if (key === 'guides' && Array.isArray(cloudValue)) {
          cloudValue = seedMissingGuides(cloudValue, allInitialGuides);
        }
        const currentJSON = JSON.stringify(state[key]);
        const cloudJSON = JSON.stringify(cloudValue);
        if (currentJSON !== cloudJSON) {
          updates[key] = cloudValue;
        }
      }
    }
    if (Object.keys(updates).length > 0) {
      store.setState(updates);
    }
  };

  return store;
}
