import { createStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

import {
  initialAnnouncements,
  initialGuides,
  initialFieldOpsGuides,
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
} from '../data';

const DATA_CACHE_KEY = 'greenteam-data-cache';

const STATE_KEYS = [
  { key: 'permissions',           supaKey: 'greenteam-permissions',           initial: {} },
  { key: 'announcements',         supaKey: 'greenteam-announcements',         initial: initialAnnouncements },
  { key: 'ownerTodos',            supaKey: 'greenteam-ownerTodos',            initial: [] },
  { key: 'ownerStartChecklist',   supaKey: 'greenteam-ownerStartChecklist',   initial: initialOwnerStartChecklist },
  { key: 'ownerEndChecklist',     supaKey: 'greenteam-ownerEndChecklist',     initial: initialOwnerEndChecklist },
  { key: 'guides',                supaKey: 'greenteam-guides',                initial: [...initialGuides, ...initialFieldOpsGuides, ...initialPMEGuides] },
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
];

function resolveInitial(cloudValue, initial) {
  if (cloudValue !== undefined && cloudValue !== null) {
    return cloudValue;
  }
  return initial;
}

export function createAppStore(cloudData) {
  const initialState = {};
  for (const { key, supaKey, initial } of STATE_KEYS) {
    initialState[key] = resolveInitial(cloudData[supaKey], initial);
  }

  const store = createStore(
    subscribeWithSelector((set) => {
      const setters = {};
      for (const { key } of STATE_KEYS) {
        const setterName = 'set' + key[0].toUpperCase() + key.slice(1);
        setters[setterName] = (valOrFn) =>
          set((state) => ({
            [key]: typeof valOrFn === 'function' ? valOrFn(state[key]) : valOrFn,
          }));
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
          } catch {}

          // Persist to Supabase
          for (const sk of keysToSync) {
            const entry = STATE_KEYS.find((e) => e.supaKey === sk);
            if (entry) {
              supabase
                .from('app_state')
                .upsert({ key: sk, value: state[entry.key] }, { onConflict: 'key' })
                .then(() => {})
                .catch(() => {});
            }
          }
        }, 500);
      }
    );
  }

  return store;
}
