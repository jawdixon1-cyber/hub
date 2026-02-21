/* ─── Onboarding steps & completion checks ─── */
/* Extracted from Training.jsx so App.jsx can use these without eagerly loading the entire Training page */

export const ONBOARDING_STEPS = [
  { id: 'onboard-1', title: 'Test Day Prep' },
  { id: 'onboard-2', title: 'Logins' },
  { id: 'onboard-3', title: 'Company Policies' },
  { id: 'onboard-4', title: 'Playbook Review' },
];

const DEFAULT_ACTION_ITEMS = {
  'onboard-1': [
    { id: 'ai1-hr' }, { id: 'ai1-safety' }, { id: 'ai1-app-cert' },
    { id: 'ai1-schedule' }, { id: 'ai1-docs' },
  ],
  'onboard-2': [
    { id: 'ai2-adp' }, { id: 'ai2-adp-walk' }, { id: 'ai2-dro' },
    { id: 'ai2-dro-walk' }, { id: 'ai2-confirm' },
  ],
  'onboard-3': [
    { id: 'ai3-timeoff' }, { id: 'ai3-conduct' }, { id: 'ai3-newhire' },
  ],
  'onboard-4': [
    { id: 'ai4-playbook' },
  ],
};

export function isOnboardingComplete(suggestions, currentUser, userEmail) {
  const nameLower = currentUser?.toLowerCase();
  return ONBOARDING_STEPS.every((step) =>
    suggestions.some(
      (s) =>
        s.type === 'onboarding' &&
        s.stepId === step.id &&
        (s.submittedByEmail === userEmail || s.submittedBy?.toLowerCase() === nameLower) &&
        s.status === 'Approved'
    )
  );
}

export function isStepApproved(suggestions, currentUser, userEmail, stepId) {
  const nameLower = currentUser?.toLowerCase();
  return suggestions.some(
    (s) =>
      s.type === 'onboarding' &&
      s.stepId === stepId &&
      (s.submittedByEmail === userEmail || s.submittedBy?.toLowerCase() === nameLower) &&
      s.status === 'Approved'
  );
}

const ONBOARDING_BYPASS = ['ethan@judeslawncare.com', 'ethan@heyjudeslawncare.com', 'ethanm.brant@gmail.com'];

export function isOnboardingEffectivelyComplete(suggestions, currentUser, userEmail, trainingConfig, permissions) {
  if (ONBOARDING_BYPASS.includes(userEmail)) return true;
  if (isOnboardingComplete(suggestions, currentUser, userEmail)) return true;
  if (!isStepApproved(suggestions, currentUser, userEmail, 'onboard-1')) return false;

  const myPlaybooks = permissions?.[userEmail]?.playbooks || [];
  const primaryTeam = myPlaybooks[0] || 'service';
  const autoSteps = ['onboard-2', 'onboard-3', 'onboard-4'];

  return autoSteps.every((stepId) => {
    const saved = trainingConfig?.onboardingSteps?.[primaryTeam]?.[stepId]?.actionItems;
    const items = saved || DEFAULT_ACTION_ITEMS[stepId] || [];
    const completions = trainingConfig?.actionCompletions?.[userEmail]?.[stepId] || {};
    return items.length > 0 && items.every((i) => completions[i.id]?.completed);
  });
}
