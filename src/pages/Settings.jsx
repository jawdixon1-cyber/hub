import { useState, lazy, Suspense } from 'react';
import { ChevronRight, ChevronDown, Pencil, Sun, Moon, Clock, Globe, Settings as SettingsIcon, ClipboardList, GraduationCap, Users, RotateCcw, AlertTriangle, Check, UserCheck, ClipboardCheck, Plus, Send, X, FileSignature, Shield, CheckSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ChecklistEditorModal = lazy(() => import('../components/ChecklistEditorModal'));
import { MODULE_LIST, ONBOARDING_STEPS } from './Training';
import { useTheme } from '../contexts/ThemeContext';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';
import { createSignUpClient } from '../lib/supabase';

const TIMEZONE_OPTIONS = [
  { value: '', label: 'Auto (device default)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
];

const TZ_STORAGE_KEY = 'greenteam-timezone';

function getDefaultActionItems(stepId) {
  const data = {
    'onboard-1': [
      { id: 'ai1-hr', type: 'policy', label: 'Read and accept HR Policies' },
      { id: 'ai1-safety', type: 'policy', label: 'Read and accept Safety Guidelines' },
      { id: 'ai1-app-cert', type: 'policy', label: 'Application Certification & Background Check Authorization' },
      { id: 'ai1-schedule', type: 'checklist', label: 'Confirm test day schedule with lead' },
      { id: 'ai1-docs', type: 'checklist', label: 'Gather required documents (ID, direct deposit info)' },
    ],
    'onboard-2': [
      { id: 'ai2-adp', type: 'checklist', label: 'Log into ADP and verify your account' },
      { id: 'ai2-adp-walk', type: 'checklist', label: 'Complete ADP walkthrough with your lead' },
      { id: 'ai2-dro', type: 'checklist', label: 'Log into DRO and verify your account' },
      { id: 'ai2-dro-walk', type: 'checklist', label: 'Complete DRO walkthrough with your lead' },
      { id: 'ai2-confirm', type: 'checklist', label: 'Confirm all logins are working' },
    ],
    'onboard-3': [
      { id: 'ai3-timeoff', type: 'policy', label: 'Read and accept Time Off & Scheduling' },
      { id: 'ai3-conduct', type: 'policy', label: 'Read and accept Code of Conduct' },
      { id: 'ai3-newhire', type: 'policy', label: 'Read and accept New Hire Onboarding' },
    ],
    'onboard-4': [
      { id: 'ai4-playbook', type: 'policy', label: 'I have reviewed and understand my assigned team playbook(s)' },
    ],
  };
  return data[stepId] || [];
}

export function SettingsContent() {
  const navigate = useNavigate();
  const { ownerMode } = useAuth();

  const { theme, themeMode, setThemeMode } = useTheme();
  const [timezone, setTimezone] = useState(() => localStorage.getItem(TZ_STORAGE_KEY) || '');
  const [showChecklistEditor, setShowChecklistEditor] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [showTraining, setShowTraining] = useState(false);
  const [resetMember, setResetMember] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetToast, setResetToast] = useState(null);

  // Test Day invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [confirmResetTestDay, setConfirmResetTestDay] = useState(null);
  const [reviewMember, setReviewMember] = useState(null);

  const permissions = useAppStore((s) => s.permissions);
  const setPermissions = useAppStore((s) => s.setPermissions);
  const trainingConfig = useAppStore((s) => s.trainingConfig);
  const setTrainingConfig = useAppStore((s) => s.setTrainingConfig);
  const suggestions = useAppStore((s) => s.suggestions);
  const setSuggestions = useAppStore((s) => s.setSuggestions);

  const memberEntries = Object.entries(permissions || {}).map(([email, p]) => ({
    email,
    name: p.name || email,
  }));

  // Reverse lookup: name → email from permissions (for matching old suggestions without submittedByEmail)
  const nameToEmail = {};
  Object.entries(permissions || {}).forEach(([email, p]) => {
    if (p.name) nameToEmail[p.name.trim().toLowerCase()] = email;
  });

  // Check if a suggestion belongs to a given member email
  const suggestionBelongsTo = (s, memberEmail, memberName) => {
    if (s.submittedByEmail === memberEmail) return true;
    if (s.submittedBy?.trim().toLowerCase() === memberName.trim().toLowerCase()) return true;
    // Reverse lookup: resolve submittedBy name → email via permissions
    const resolved = nameToEmail[s.submittedBy?.trim().toLowerCase()];
    if (resolved === memberEmail) return true;
    return false;
  };

  // Action item helpers (parameterized by stepId)
  const getActionItems = (email, stepId) => {
    const team = permissions[email]?.playbooks?.[0] || 'service';
    const saved = trainingConfig?.onboardingSteps?.[team]?.[stepId]?.actionItems;
    return saved || getDefaultActionItems(stepId);
  };

  const getCompletions = (email, stepId) => {
    return trainingConfig?.actionCompletions?.[email]?.[stepId] || {};
  };

  // Multi-step onboarding progress: find the first step that isn't approved yet
  const getOnboardProgress = (member) => {
    for (const step of ONBOARDING_STEPS) {
      const submission = suggestions.find(
        (s) =>
          s.type === 'onboarding' &&
          s.stepId === step.id &&
          suggestionBelongsTo(s, member.email, member.name)
      );
      if (submission?.status === 'Approved') continue; // step done, check next

      const items = getActionItems(member.email, step.id);
      const completions = getCompletions(member.email, step.id);
      const allItemsDone = items.length > 0 && items.every((item) => completions[item.id]?.completed);

      return {
        currentStep: step,
        allItemsDone,
        hasSubmission: !!submission,
      };
    }
    return null; // all steps approved
  };

  const unonboardedMembers = memberEntries
    .map((member) => ({ ...member, progress: getOnboardProgress(member) }))
    .filter((m) => m.progress !== null);

  const handleApproveOnboarding = (member, stepId) => {
    const updated = suggestions.map((s) => {
      if (
        s.type === 'onboarding' &&
        s.stepId === stepId &&
        suggestionBelongsTo(s, member.email, member.name) &&
        s.status !== 'Approved'
      ) {
        return { ...s, status: 'Approved' };
      }
      return s;
    });
    setSuggestions(updated);
    const stepTitle = ONBOARDING_STEPS.find((st) => st.id === stepId)?.title || stepId;
    showResetToast(`${stepTitle} approved for ${member.name}`);
  };

  const handleResetTestDay = (member) => {
    // Clear ALL onboarding step action completions
    const cfg = JSON.parse(JSON.stringify(trainingConfig || {}));
    if (cfg.actionCompletions?.[member.email]) {
      for (const step of ONBOARDING_STEPS) {
        if (cfg.actionCompletions[member.email][step.id]) {
          delete cfg.actionCompletions[member.email][step.id];
        }
      }
    }
    setTrainingConfig(cfg);

    // Remove ALL onboarding suggestions for this member
    const filtered = suggestions.filter(
      (s) => !(s.type === 'onboarding' &&
        suggestionBelongsTo(s, member.email, member.name))
    );
    setSuggestions(filtered);

    setConfirmResetTestDay(null);
    showResetToast(`Onboarding reset for ${member.name}`);
  };

  const handleResetStep = (member, stepId) => {
    // Clear action completions for this specific step
    const cfg = JSON.parse(JSON.stringify(trainingConfig || {}));
    if (cfg.actionCompletions?.[member.email]?.[stepId]) {
      delete cfg.actionCompletions[member.email][stepId];
    }
    setTrainingConfig(cfg);

    // Remove suggestions for this specific step
    const filtered = suggestions.filter(
      (s) => !(s.type === 'onboarding' && s.stepId === stepId &&
        suggestionBelongsTo(s, member.email, member.name))
    );
    setSuggestions(filtered);

    const stepTitle = ONBOARDING_STEPS.find((st) => st.id === stepId)?.title || stepId;
    showResetToast(`${stepTitle} reset for ${member.name}`);
  };

  const handleInviteMember = async (e) => {
    e.preventDefault();
    setInviteError('');

    const trimmedEmail = inviteEmail.trim().toLowerCase();
    const trimmedName = inviteName.trim();
    if (!trimmedEmail || !trimmedName || !invitePassword) {
      setInviteError('All fields are required.');
      return;
    }
    if (permissions[trimmedEmail]) {
      setInviteError('A member with this email already exists.');
      return;
    }

    setInviteLoading(true);
    try {
      const signUpClient = createSignUpClient();
      const { error } = await signUpClient.auth.signUp({
        email: trimmedEmail,
        password: invitePassword,
        options: { data: { display_name: trimmedName, role: 'member' } },
      });

      if (error) {
        if (error.message?.includes('already registered')) {
          // User exists in Supabase but not in permissions — just add them
          setPermissions({
            ...permissions,
            [trimmedEmail]: { name: trimmedName, playbooks: ['service'] },
          });
          setInviteName('');
          setInviteEmail('');
          setInvitePassword('');
          setShowInvite(false);
          showResetToast(`${trimmedName} added to Test Day`);
          return;
        } else if (error.message?.includes('password')) {
          setInviteError('Password is too weak. Use at least 6 characters.');
        } else {
          setInviteError(error.message || 'Failed to create account.');
        }
        return;
      }

      setPermissions({
        ...permissions,
        [trimmedEmail]: { name: trimmedName, playbooks: ['service'] },
      });
      setInviteName('');
      setInviteEmail('');
      setInvitePassword('');
      setShowInvite(false);
      showResetToast(`Invite sent to ${trimmedName}`);
    } catch {
      setInviteError('Network error. Please try again.');
    } finally {
      setInviteLoading(false);
    }
  };

  const teamChecklist = useAppStore((s) => s.teamChecklist);
  const setTeamChecklist = useAppStore((s) => s.setTeamChecklist);
  const teamEndChecklist = useAppStore((s) => s.teamEndChecklist);
  const setTeamEndChecklist = useAppStore((s) => s.setTeamEndChecklist);
  const ownerStartChecklist = useAppStore((s) => s.ownerStartChecklist);
  const setOwnerStartChecklist = useAppStore((s) => s.setOwnerStartChecklist);
  const ownerEndChecklist = useAppStore((s) => s.ownerEndChecklist);
  const setOwnerEndChecklist = useAppStore((s) => s.setOwnerEndChecklist);

  const showResetToast = (msg) => {
    setResetToast(msg);
    setTimeout(() => setResetToast(null), 4000);
  };

  const handleResetTraining = () => {
    if (!resetMember) return;
    const member = memberEntries.find((m) => m.email === resetMember);
    if (!member) return;

    // 1. Clear action completions for this member
    const updated = { ...trainingConfig };
    if (updated.actionCompletions?.[member.email]) {
      updated.actionCompletions = { ...updated.actionCompletions };
      delete updated.actionCompletions[member.email];
    }
    setTrainingConfig(updated);

    // 2. Remove onboarding & training suggestions submitted by this member
    const filtered = suggestions.filter(
      (s) =>
        !((s.type === 'onboarding' || s.type === 'training') &&
          suggestionBelongsTo(s, member.email, member.name))
    );
    setSuggestions(filtered);

    setConfirmReset(false);
    setResetMember('');
    showResetToast(`Training reset for ${member.name}`);
  };

  const handleTimezoneChange = (value) => {
    setTimezone(value);
    if (value) {
      localStorage.setItem(TZ_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(TZ_STORAGE_KEY);
    }
  };

  return (
    <div className="space-y-8">
      {/* Toast */}
      {resetToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium shadow-lg flex items-center gap-2 max-w-sm text-center">
          <Check size={16} className="shrink-0" />
          {resetToast}
        </div>
      )}

      {/* ── Preferences ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon size={22} className="text-brand-text" />
          <h2 className="text-2xl font-bold text-primary">Settings</h2>
        </div>

        <div className="bg-card rounded-2xl shadow-lg border border-border-subtle overflow-hidden">
          <button
            onClick={() => setShowPrefs(!showPrefs)}
            className="w-full flex items-center justify-between p-6 cursor-pointer hover:bg-surface-alt/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <SettingsIcon size={18} className="text-muted" />
              <div className="text-left">
                <p className="text-sm font-medium text-primary">Preferences</p>
                <p className="text-xs text-tertiary">Appearance and time zone</p>
              </div>
            </div>
            <ChevronDown size={16} className={`text-muted shrink-0 transition-transform duration-200 ${showPrefs ? 'rotate-180' : ''}`} />
          </button>

          {showPrefs && (
            <div className="px-6 pb-6 space-y-6 border-t border-border-subtle pt-4">
              {/* Theme */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {theme === 'dark' ? <Moon size={18} className="text-muted" /> : <Sun size={18} className="text-muted" />}
                  <div>
                    <p className="text-sm font-medium text-primary">Appearance</p>
                    <p className="text-xs text-tertiary">
                      {themeMode === 'auto'
                        ? `Auto — currently ${theme} until ${theme === 'dark' ? '7:00 AM' : '8:00 PM'}`
                        : theme === 'dark' ? 'Dark mode' : 'Light mode'}
                    </p>
                  </div>
                </div>
                <div className="flex rounded-lg border border-border-default overflow-hidden">
                  {[
                    { mode: 'light', icon: <Sun size={14} />, label: 'Light' },
                    { mode: 'dark', icon: <Moon size={14} />, label: 'Dark' },
                    { mode: 'auto', icon: <Clock size={14} />, label: 'Auto' },
                  ].map(({ mode, icon, label }) => (
                    <button
                      key={mode}
                      onClick={() => setThemeMode(mode)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                        themeMode === mode
                          ? 'bg-brand text-on-brand'
                          : 'bg-card text-secondary hover:bg-surface'
                      }`}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timezone */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Globe size={18} className="text-muted" />
                  <div>
                    <p className="text-sm font-medium text-primary">Time Zone</p>
                    <p className="text-xs text-tertiary">Used for dates and schedules</p>
                  </div>
                </div>
                <select
                  value={timezone}
                  onChange={(e) => handleTimezoneChange(e.target.value)}
                  className="rounded-lg border border-border-default bg-card px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition max-w-[220px]"
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Edit Checklists (owner only) ── */}
      {ownerMode && (
        <div>
          <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ClipboardList size={18} className="text-muted" />
                <div>
                  <p className="text-sm font-medium text-primary">Checklists</p>
                  <p className="text-xs text-tertiary">Edit team and owner daily checklists</p>
                </div>
              </div>
              <button
                onClick={() => setShowChecklistEditor(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand font-medium text-sm hover:bg-brand-hover transition-colors"
              >
                <Pencil size={14} />
                Edit Checklists
              </button>
            </div>
          </div>

          {showChecklistEditor && (
            <Suspense fallback={null}>
              <ChecklistEditorModal
                onClose={() => setShowChecklistEditor(false)}
                teamChecklist={teamChecklist}
                setTeamChecklist={setTeamChecklist}
                teamEndChecklist={teamEndChecklist}
                setTeamEndChecklist={setTeamEndChecklist}
                ownerStartChecklist={ownerStartChecklist}
                setOwnerStartChecklist={setOwnerStartChecklist}
                ownerEndChecklist={ownerEndChecklist}
                setOwnerEndChecklist={setOwnerEndChecklist}
              />
            </Suspense>
          )}
        </div>
      )}

      {/* ── Test Day (owner only) ── */}
      {ownerMode && (
        <div>
          <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-6">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                <ClipboardCheck size={18} className="text-orange-500" />
                <div>
                  <p className="text-sm font-medium text-primary">Test Day</p>
                  <p className="text-xs text-tertiary">Onboard new team members</p>
                </div>
              </div>
              {!showInvite && (
                <button
                  onClick={() => setShowInvite(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 text-white font-medium text-sm hover:bg-orange-600 transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  New Member
                </button>
              )}
            </div>

            {/* Invite Form */}
            {showInvite && (
              <form onSubmit={handleInviteMember} className="mt-4 p-4 rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 space-y-3">
                <p className="text-xs font-semibold text-secondary">
                  Create an account for the new team member. They'll sign in and see the Test Day Prep steps.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-secondary block mb-1">Name</label>
                    <input
                      type="text"
                      required
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition"
                      placeholder="John Smith"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-secondary block mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary block mb-1">Temporary Password</label>
                  <input
                    type="text"
                    required
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition"
                    placeholder="At least 6 characters"
                  />
                  <p className="text-[10px] text-muted mt-1">Share this password with them so they can sign in.</p>
                </div>
                {inviteError && (
                  <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{inviteError}</p>
                )}
                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => { setShowInvite(false); setInviteName(''); setInviteEmail(''); setInvitePassword(''); setInviteError(''); }}
                    className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteLoading}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send size={14} />
                    {inviteLoading ? 'Creating...' : 'Create & Send'}
                  </button>
                </div>
              </form>
            )}

            {/* Member List */}
            {unonboardedMembers.length === 0 && !showInvite ? (
              <p className="text-xs text-muted mt-3">All team members have been onboarded.</p>
            ) : unonboardedMembers.length > 0 ? (
              <div className="space-y-3 mt-4">
                {unonboardedMembers.map((member) => {
                  const { currentStep, allItemsDone, hasSubmission } = member.progress;
                  const isPreHire = currentStep.id === 'onboard-1';
                  const isReady = allItemsDone || hasSubmission;

                  const cardColor = isPreHire
                    ? (isReady
                        ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                        : hasSubmission
                        ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                        : 'bg-surface-alt border-border-subtle')
                    : (allItemsDone
                        ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                        : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800');

                  const statusText = isPreHire
                    ? (isReady ? 'Finished' : hasSubmission ? 'Awaiting approval' : 'Not started')
                    : (allItemsDone
                        ? `Ready for review: ${currentStep.title}`
                        : `Onboarding: ${currentStep.title}`);

                  const statusColor = isPreHire
                    ? (isReady ? 'text-emerald-600' : hasSubmission ? 'text-amber-600' : 'text-muted')
                    : (allItemsDone ? 'text-emerald-600' : 'text-blue-600');

                  return (
                    <div
                      key={member.email}
                      className={`flex items-center gap-3 rounded-xl border p-4 ${cardColor}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-primary">{member.name}</p>
                        <p className="text-xs text-tertiary truncate">{member.email}</p>
                        <span className={`text-[10px] font-semibold mt-1 block ${statusColor}`}>
                          {statusText}
                        </span>
                      </div>
                      {isReady && (
                        <button
                          onClick={() => setReviewMember(member)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-secondary border border-border-strong hover:bg-surface transition-colors cursor-pointer shrink-0"
                        >
                          Review
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmResetTestDay(member)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer shrink-0"
                        title="Reset Onboarding"
                      >
                        <RotateCcw size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Review Modal */}
          {reviewMember && (() => {
            const prog = reviewMember.progress;
            if (!prog) return null;
            const reviewStepId = prog.currentStep.id;
            const reviewStepTitle = prog.currentStep.title;
            const isPreHire = reviewStepId === 'onboard-1';
            const items = getActionItems(reviewMember.email, reviewStepId);
            const completions = getCompletions(reviewMember.email, reviewStepId);
            const completedCount = items.filter((item) => completions[item.id]?.completed).length;
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="bg-card rounded-2xl shadow-xl border border-border-subtle max-w-lg w-full flex flex-col max-h-[90vh]">
                  {/* Header */}
                  <div className="flex items-center justify-between p-6 border-b border-border-subtle shrink-0">
                    <div>
                      <h3 className="font-bold text-primary text-lg">{reviewMember.name}</h3>
                      <p className="text-xs text-tertiary">{reviewMember.email}</p>
                      <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-alt text-secondary">
                        {reviewStepTitle}
                      </span>
                    </div>
                    <button
                      onClick={() => setReviewMember(null)}
                      className="p-2 rounded-lg hover:bg-surface transition-colors cursor-pointer text-muted"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Body */}
                  <div className="overflow-y-auto p-6 space-y-4 flex-1">
                    <p className="text-sm font-semibold text-secondary">
                      {completedCount}/{items.length} completed
                    </p>

                    <div className="space-y-2">
                      {items.map((item) => {
                        const completion = completions[item.id];
                        const done = completion?.completed;
                        return (
                          <div key={item.id} className={`rounded-xl border p-3 ${done ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/10' : 'border-border-subtle bg-surface-alt'}`}>
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 shrink-0">
                                {done ? (
                                  <CheckSquare size={16} className="text-emerald-500" />
                                ) : (
                                  <div className="w-4 h-4 rounded border-2 border-gray-300 dark:border-gray-600" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                    item.type === 'policy'
                                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                  }`}>
                                    {item.type === 'policy' ? <Shield size={10} /> : <CheckSquare size={10} />}
                                    {item.type === 'policy' ? 'Policy' : 'Checklist'}
                                  </span>
                                </div>
                                <p className={`text-sm ${done ? 'text-primary' : 'text-secondary'}`}>{item.label}</p>
                                {done && completion.date && (
                                  <p className="text-[10px] text-muted mt-1">Completed {completion.date}</p>
                                )}
                                {done && item.type === 'policy' && completion.signature && (
                                  <div className="mt-2 p-2 bg-white dark:bg-gray-900 rounded-lg border border-border-subtle inline-block">
                                    <div className="flex items-center gap-1 mb-1">
                                      <FileSignature size={10} className="text-muted" />
                                      <span className="text-[10px] text-muted">Signature</span>
                                    </div>
                                    <img src={completion.signature} alt="Signature" className="max-h-12 w-auto" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex gap-3 justify-end p-6 border-t border-border-subtle shrink-0">
                    {isPreHire ? (
                      <>
                        <button
                          onClick={() => { handleResetTestDay(reviewMember); setReviewMember(null); }}
                          className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors cursor-pointer"
                        >
                          Not a Good Fit
                        </button>
                        <button
                          onClick={() => { handleApproveOnboarding(reviewMember, reviewStepId); setReviewMember(null); }}
                          className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors cursor-pointer"
                        >
                          Hire
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { handleResetStep(reviewMember, reviewStepId); setReviewMember(null); }}
                          className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors cursor-pointer"
                        >
                          Reset Step
                        </button>
                        <button
                          onClick={() => { handleApproveOnboarding(reviewMember, reviewStepId); setReviewMember(null); }}
                          className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors cursor-pointer"
                        >
                          Approve
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Reset Test Day Confirmation */}
          {confirmResetTestDay && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-card rounded-2xl shadow-xl border border-border-subtle max-w-sm w-full p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                    <AlertTriangle size={20} className="text-red-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-primary">Reset Onboarding?</h3>
                    <p className="text-sm text-secondary">
                      This will clear all onboarding progress for{' '}
                      <span className="font-semibold">{confirmResetTestDay.name}</span>.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-tertiary">
                  Action item completions and all submitted steps will be removed. They'll see the Test Day Prep screen again on their next sign-in.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setConfirmResetTestDay(null)}
                    className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleResetTestDay(confirmResetTestDay)}
                    className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors cursor-pointer"
                  >
                    Reset Onboarding
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Training Modules (owner only) ── */}
      {ownerMode && (
        <div>
          <div className="bg-card rounded-2xl shadow-lg border border-border-subtle overflow-hidden">
            <button
              onClick={() => setShowTraining(!showTraining)}
              className="w-full flex items-center justify-between p-6 cursor-pointer hover:bg-surface-alt/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <GraduationCap size={18} className="text-muted" />
                <div className="text-left">
                  <p className="text-sm font-medium text-primary">Training Modules</p>
                  <p className="text-xs text-tertiary">Edit sections, content, and team-specific training</p>
                </div>
              </div>
              <ChevronDown size={16} className={`text-muted shrink-0 transition-transform duration-200 ${showTraining ? 'rotate-180' : ''}`} />
            </button>

            {showTraining && (
              <div className="px-6 pb-6 border-t border-border-subtle pt-4">
                {/* Onboarding steps */}
                <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Onboarding Steps</p>
                <div className="space-y-2 mb-4">
                  {ONBOARDING_STEPS.map((step) => {
                    const StepIcon = step.icon;
                    return (
                      <button
                        key={step.id}
                        onClick={() => navigate(`/training/onboard/${step.id}`)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border-default hover:bg-surface transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <StepIcon size={16} className={step.color} />
                          <span className="text-sm font-medium text-primary truncate">{step.title}</span>
                        </div>
                        <ChevronRight size={14} className="text-muted shrink-0" />
                      </button>
                    );
                  })}
                </div>

                {/* Module list */}
                <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Modules</p>
                <div className="space-y-2">
                  {MODULE_LIST.map((mod) => (
                    <button
                      key={mod.id}
                      onClick={() => navigate(`/training/${mod.id}`)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border-default hover:bg-surface transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <mod.icon size={16} className={mod.color} />
                        <span className="text-sm font-medium text-primary truncate">{mod.title}</span>
                      </div>
                      <ChevronRight size={14} className="text-muted shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Reset Training (owner only) ── */}
      {ownerMode && memberEntries.length > 0 && (
        <div>
          <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-6">
            <div className="flex items-center gap-3 mb-4">
              <RotateCcw size={18} className="text-muted" />
              <div>
                <p className="text-sm font-medium text-primary">Reset Training</p>
                <p className="text-xs text-tertiary">Clear onboarding and training progress for a team member</p>
              </div>
            </div>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-secondary block mb-1">Team Member</label>
                <select
                  value={resetMember}
                  onChange={(e) => setResetMember(e.target.value)}
                  className="w-full rounded-lg border border-border-default bg-card px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
                >
                  <option value="">Select a member…</option>
                  {memberEntries.map((m) => (
                    <option key={m.email} value={m.email}>{m.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => resetMember && setConfirmReset(true)}
                disabled={!resetMember}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Confirmation Modal */}
          {confirmReset && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-card rounded-2xl shadow-xl border border-border-subtle max-w-sm w-full p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                    <AlertTriangle size={20} className="text-red-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-primary">Reset Training?</h3>
                    <p className="text-sm text-secondary">
                      This will clear all onboarding and training progress for{' '}
                      <span className="font-semibold">{memberEntries.find((m) => m.email === resetMember)?.name}</span>.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-tertiary">
                  Action item completions, signatures, and submitted onboarding/training updates will be permanently removed.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setConfirmReset(false)}
                    className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleResetTraining}
                    className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors cursor-pointer"
                  >
                    Reset Training
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Team Management (owner only) ── */}
      {ownerMode && (
        <div>
          <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-6">
            <button
              onClick={() => navigate('/team')}
              className="w-full flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Users size={18} className="text-muted" />
                <div className="text-left">
                  <p className="text-sm font-medium text-primary">Team Management</p>
                  <p className="text-xs text-tertiary">Add members, edit permissions, view onboarding progress</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-muted shrink-0" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  return <SettingsContent />;
}
