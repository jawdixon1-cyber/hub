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
import { initialHiringContent, initialApplicationForm, initialJobPost } from '../data/hiringDefaults';
import { TRIAL_AGREEMENT_SECTIONS, TRIAL_AGREEMENT_ACKNOWLEDGMENT, DEFAULT_TRIAL_AGREEMENT_VERSION, DEFAULT_TRIAL_DAY_PLAYBOOK } from '../data/trialAgreement';
import { DEFAULT_ROLES, DEFAULT_ROLES_VERSION } from '../data/roleTemplates';

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
  { key: 'agreementPdf',       supaKey: 'greenteam-agreementPdf',       initial: null },
  { key: 'presence',             supaKey: 'greenteam-presence',             initial: {} },
  { key: 'businessSettings',    supaKey: 'greenteam-businessSettings',    initial: { name: "Hey Jude's Lawn Care", city: 'Rock Hill', state: 'SC', lat: 34.9249, lon: -81.025 } },
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
  { key: 'roles',               supaKey: 'greenteam-roles',               initial: { version: DEFAULT_ROLES_VERSION, items: DEFAULT_ROLES } },
  { key: 'hiringContent',       supaKey: 'greenteam-hiringContent',       initial: initialHiringContent },
  { key: 'applicationForm',     supaKey: 'greenteam-applicationForm',     initial: initialApplicationForm },
  { key: 'applications',        supaKey: 'greenteam-applications',        initial: [] },
  { key: 'jobPost',             supaKey: 'greenteam-jobPost',             initial: initialJobPost },
  { key: 'trialAgreement', supaKey: 'greenteam-trialAgreement', initial: { version: DEFAULT_TRIAL_AGREEMENT_VERSION, sections: TRIAL_AGREEMENT_SECTIONS, acknowledgment: TRIAL_AGREEMENT_ACKNOWLEDGMENT } },
  { key: 'trialDayPlaybook', supaKey: 'greenteam-trialDayPlaybook', initial: DEFAULT_TRIAL_DAY_PLAYBOOK },
  { key: 'onboardingSteps', supaKey: 'greenteam-onboardingSteps', initial: [
    // Before trial — online stuff they do the day before
    { id: 'trial_agreement', label: 'Sign Trial Day Agreement', phase: 'before' },
    { id: 'payroll_form', label: 'Fill out payroll form (W-4, I-9, direct deposit)', phase: 'before' },
    { id: 'emergency_contact', label: 'Provide emergency contact info', phase: 'before' },
    { id: 'hub_invite', label: 'Create Hub account (send invite)', phase: 'before' },
    { id: 'jobber_invite', label: 'Add to Jobber', phase: 'before' },
    // Morning of trial
    { id: 'uniform', label: 'Issue uniform', phase: 'morning' },
    { id: 'equipment', label: 'Issue tools/equipment', phase: 'morning' },
    { id: 'first_job_brief', label: 'Walk through first job + expectations', phase: 'morning' },
    // After trial — only if they passed and are being kept on
    { id: 'standards_agreement', label: 'Sign full Standards Agreement', phase: 'after' },
    { id: 'payroll_active', label: 'Activate on payroll', phase: 'after' },
    { id: 'assign_role', label: 'Assign role + permissions in Hub', phase: 'after' },
  ] },
  { key: 'phoneScreenQuestions', supaKey: 'greenteam-phoneScreenQuestions', initial: [
    { id: 'opener', label: "Hey [name], this is Jude from Hey Jude's Lawn Care — how's it going?" },
    { id: 'frame', label: "Quick thing before we dive in — this call goes both ways. I wanna see if you're the right fit for us, and I want you to see if we're the right spot for you. I care more about who you are than your resume. So just be real with me — no right or wrong answers.", type: 'info' },
    { id: 'whats_important', label: "What matters most to you these days? Family, faith, goals — what are you really focused on?" },
    { id: 'proud_of', label: "What's something you're proud of? Doesn't have to be work — anything." },
    { id: 'free_time', label: "Outside of work, what do you pour your time into?" },
    { id: 'why_looking', label: "You've been looking for work for [duration] — what's going on with that?" },
    { id: 'previous_dislikes', label: "I wanna be the best boss I can be — is there anything you didn't like about your previous employers?" },
    { id: 'five_years', label: "If things go right, what does life look like in 5 years?" },
    { id: 'record_smoke', label: "Real talk — any record, or anything you smoke regularly?" },
    { id: 'why_us', label: "What made you apply here specifically?" },
    { id: 'their_questions', label: "What questions do you have for me?" },
  ] },
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

export function createAppStore(cloudData, orgId) {
  const allInitialGuides = [...initialGuides, ...initialFieldOpsGuides, ...initialPMEGuides, ...initialGMGuides];
  const initialState = {};
  for (const { key, supaKey, initial } of STATE_KEYS) {
    let value = resolveInitial(cloudData[supaKey], initial);
    // Seed any new default guides into existing cloud data
    if (key === 'guides' && Array.isArray(value)) {
      value = seedMissingGuides(value, allInitialGuides);
    }
    // Force latest 6-step GHL survey form if stored version is outdated
    if (key === 'applicationForm' && value) {
      const totalFields = (value.steps || []).reduce((n, s) => n + (s.fields?.length || 0), 0);
      if (!value.steps || totalFields < 20 || (value.version || 0) < (initial.version || 0)) {
        value = initial;
      }
    }
    // Replace phone-screen questions if they predate the current condensed set
    if (key === 'phoneScreenQuestions' && Array.isArray(value)) {
      const ids = new Set(value.map((q) => q?.id));
      if (!ids.has('whats_important') || !ids.has('proud_of') || !ids.has('previous_dislikes') || ids.has('life_now') || ids.has('dealbreakers')) {
        value = initial;
      }
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
              if (orgId) payload.org_id = orgId;
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
        // Force latest application form (6 steps, 28+ fields)
        if (key === 'applicationForm') {
          try {
            const totalFields = (cloudValue?.steps || []).reduce((n, s) => n + (s?.fields?.length || 0), 0);
            if (totalFields < 20 || (cloudValue?.version || 0) < (initial.version || 0)) {
              cloudValue = initial;
              const payload = { key: supaKey, value: initial };
              if (orgId) payload.org_id = orgId;
              supabase.from('app_state').upsert(payload, { onConflict: 'key' }).catch(() => {});
            }
          } catch {}
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
