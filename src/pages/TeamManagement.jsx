import { useState } from 'react';
import {
  ArrowLeft, ChevronRight, ChevronUp, Plus,
  Users, Shield, CheckSquare,
  ClipboardCheck, UserCheck, FileCheck,
  Check, Clock, Eye, EyeOff, Trash2, AlertCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createSignUpClient } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { ONBOARDING_STEPS } from './Training';

const PLAYBOOK_OPTIONS = [
  { key: 'service', label: 'Team Member', color: 'bg-emerald-100 text-emerald-700' },
  { key: 'leader', label: 'Leader', color: 'bg-amber-100 text-amber-700' },
  { key: 'sales', label: 'Sales Team', color: 'bg-purple-100 text-purple-700' },
  { key: 'strategy', label: 'General Manager', color: 'bg-blue-100 text-blue-700' },
];

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
  };
  return data[stepId] || [];
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ── Main Component ── */

export default function TeamManagement() {
  const navigate = useNavigate();
  const { ownerMode } = useAuth();

  const permissions = useAppStore((s) => s.permissions);
  const setPermissions = useAppStore((s) => s.setPermissions);
  const suggestions = useAppStore((s) => s.suggestions);
  const trainingConfig = useAppStore((s) => s.trainingConfig);

  // Add member form state
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPlaybooks, setSelectedPlaybooks] = useState(['service']);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);

  if (!ownerMode) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">Access denied.</p>
        <button onClick={() => navigate('/')} className="mt-4 text-sm text-blue-600 underline cursor-pointer">
          Go Home
        </button>
      </div>
    );
  }

  const members = Object.entries(permissions).map(([memberEmail, data]) => ({
    email: memberEmail,
    name: data.name,
    playbooks: data.playbooks || [],
  }));

  /* ── Add member helpers ── */

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setSelectedPlaybooks(['service']);
    setFormError('');
  };

  const togglePlaybook = (key) => {
    setSelectedPlaybooks((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    setFormError('');

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();
    if (!trimmedEmail || !trimmedName || !password) {
      setFormError('All fields are required.');
      return;
    }
    if (permissions[trimmedEmail]) {
      setFormError('A member with this email already exists.');
      return;
    }

    setFormLoading(true);
    try {
      const signUpClient = createSignUpClient();
      const { error } = await signUpClient.auth.signUp({
        email: trimmedEmail,
        password,
        options: { data: { display_name: trimmedName, role: 'member' } },
      });

      if (error) {
        if (error.message?.includes('already registered')) {
          setPermissions({
            ...permissions,
            [trimmedEmail]: { name: trimmedName, playbooks: selectedPlaybooks },
          });
          resetForm();
          setShowForm(false);
          return;
        } else if (error.message?.includes('password')) {
          setFormError('Password is too weak. Use at least 6 characters.');
        } else {
          setFormError(error.message || 'Failed to create account.');
        }
        return;
      }

      setPermissions({
        ...permissions,
        [trimmedEmail]: { name: trimmedName, playbooks: selectedPlaybooks },
      });
      resetForm();
      setShowForm(false);
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setFormLoading(false);
    }
  };

  const removeMember = (memberEmail) => {
    const next = { ...permissions };
    delete next[memberEmail];
    setPermissions(next);
    setConfirmRemove(null);
  };

  /* ── Onboarding helpers ── */

  const getMemberStepStatus = (memberName, stepId) => {
    const entry = suggestions.find(
      (s) => s.type === 'onboarding' && s.stepId === stepId && s.submittedBy === memberName
    );
    if (!entry) return { status: null };
    return { status: entry.status };
  };

  const getActionItemsProgress = (memberEmail, stepId) => {
    const team = permissions[memberEmail]?.playbooks?.[0] || 'service';
    const saved = trainingConfig?.onboardingSteps?.[team]?.[stepId]?.actionItems;
    const items = saved || getDefaultActionItems(stepId);
    const completions = trainingConfig?.actionCompletions?.[memberEmail]?.[stepId] || {};
    const done = items.filter((i) => completions[i.id]?.completed).length;
    return { total: items.length, done };
  };

  const isFullyOnboarded = (memberName) => {
    return suggestions.some(
      (s) =>
        s.type === 'onboarding' &&
        s.stepId === 'onboard-2' &&
        s.submittedBy === memberName &&
        s.status === 'Approved'
    );
  };

  const needsHiringDecision = (memberName, memberEmail) => {
    const step1Entry = suggestions.find(
      (s) => s.type === 'onboarding' && s.stepId === 'onboard-1' && s.submittedBy === memberName
    );
    const step1Approved = step1Entry?.status === 'Approved';
    if (step1Approved) return false;

    // Submitted but not approved
    if (step1Entry) return true;

    // All action items done but not submitted
    const p = getActionItemsProgress(memberEmail, 'onboard-1');
    return p.total > 0 && p.done === p.total;
  };

  /* ── Stats ── */
  const totalMembers = members.length;
  const fullyOnboarded = members.filter((m) => isFullyOnboarded(m.name)).length;
  const inProgress = members.filter((m) => {
    const hasAny = ONBOARDING_STEPS.some((step) => getMemberStepStatus(m.name, step.id).status);
    return hasAny && !isFullyOnboarded(m.name);
  }).length;
  const notStarted = totalMembers - fullyOnboarded - inProgress;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/profile')}
          className="inline-flex items-center gap-1.5 text-sm text-tertiary hover:text-secondary transition-colors cursor-pointer mb-4"
        >
          <ArrowLeft size={16} />
          Back to Profile
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-brand-light flex items-center justify-center">
              <Users size={24} className="text-brand-text-strong" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-primary">Team Management</h1>
              <p className="text-sm text-tertiary">{totalMembers} team member{totalMembers !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand font-medium text-sm hover:bg-brand-hover transition-colors cursor-pointer"
          >
            {showForm ? <ChevronUp size={18} /> : <Plus size={18} />}
            {showForm ? 'Close' : 'Add Member'}
          </button>
        </div>
      </div>

      {/* Add Member Form */}
      {showForm && (
        <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-6">
          <h3 className="text-lg font-bold text-primary mb-4">New Team Member</h3>
          <form onSubmit={handleAddMember} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Display Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John"
                className="w-full rounded-xl border border-border-default px-4 py-2.5 text-sm text-primary placeholder-placeholder-muted focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                className="w-full rounded-xl border border-border-default px-4 py-2.5 text-sm text-primary placeholder-placeholder-muted focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full rounded-xl border border-border-default px-4 py-2.5 pr-10 text-sm text-primary placeholder-placeholder-muted focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-2">Playbook Access</label>
              <div className="flex flex-wrap gap-2">
                {PLAYBOOK_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => togglePlaybook(opt.key)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                      selectedPlaybooks.includes(opt.key)
                        ? `${opt.color} border-current`
                        : 'bg-surface text-muted border-border-default'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted mt-1">New members default to Field Team only. Sales Team and General Manager contain sensitive data.</p>
            </div>

            {formError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>
            )}

            <button
              type="submit"
              disabled={formLoading}
              className="w-full py-2.5 rounded-xl bg-brand text-on-brand font-semibold hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {formLoading ? 'Creating Account...' : 'Create Member'}
            </button>
          </form>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-xl border border-border-subtle p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{fullyOnboarded}</p>
          <p className="text-[11px] text-tertiary font-medium">Fully Onboarded</p>
        </div>
        <div className="bg-card rounded-xl border border-border-subtle p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{inProgress}</p>
          <p className="text-[11px] text-tertiary font-medium">In Progress</p>
        </div>
        <div className="bg-card rounded-xl border border-border-subtle p-4 text-center">
          <p className="text-2xl font-bold text-muted">{notStarted}</p>
          <p className="text-[11px] text-tertiary font-medium">Not Started</p>
        </div>
      </div>

      {/* Member List */}
      {members.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-8 text-center">
          <p className="text-muted text-sm">No team members added yet.</p>
          <p className="text-xs text-tertiary mt-2">Use the "Add Member" button above to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((member) => {
            const onboarded = isFullyOnboarded(member.name);
            const pendingHire = needsHiringDecision(member.name, member.email);

            // Step status dots
            const stepOverview = ONBOARDING_STEPS.map((step) => {
              const { status } = getMemberStepStatus(member.name, step.id);
              return { stepId: step.id, status };
            });

            // Overall action item progress
            const totalActions = ONBOARDING_STEPS.reduce((acc, step) => {
              const p = getActionItemsProgress(member.email, step.id);
              acc.total += p.total;
              acc.done += p.done;
              return acc;
            }, { total: 0, done: 0 });

            return (
              <div key={member.email} className="flex items-center gap-2">
                <button
                  onClick={() => navigate(`/team/${encodeURIComponent(member.email)}`)}
                  className="flex-1 bg-card rounded-2xl shadow-sm border border-border-subtle overflow-hidden flex items-center gap-3 p-4 sm:p-5 text-left cursor-pointer hover:border-border-strong hover:shadow-md transition-all group"
                >
                  {/* Avatar */}
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    onboarded ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-light text-brand-text-strong'
                  }`}>
                    {getInitials(member.name)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-primary truncate">{member.name}</h3>
                      {onboarded && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          Onboarded
                        </span>
                      )}
                      {pendingHire && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                          <AlertCircle size={10} />
                          Hiring Decision
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-tertiary truncate">{member.email}</p>
                    {/* Team badges + action progress */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {member.playbooks.map((key) => {
                        const opt = PLAYBOOK_OPTIONS.find((o) => o.key === key);
                        return opt ? (
                          <span key={key} className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${opt.color}`}>
                            {opt.label}
                          </span>
                        ) : null;
                      })}
                      {totalActions.total > 0 && (
                        <span className="text-[10px] text-muted">
                          {totalActions.done}/{totalActions.total} actions
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Step status dots */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {stepOverview.map((s) => (
                      <div
                        key={s.stepId}
                        className={`w-3 h-3 rounded-full ${
                          s.status === 'Approved'
                            ? 'bg-emerald-500'
                            : s.status
                              ? 'bg-amber-400'
                              : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      />
                    ))}
                  </div>

                  <ChevronRight size={18} className="text-muted shrink-0 group-hover:text-secondary transition-colors" />
                </button>

                {/* Remove button */}
                <button
                  onClick={() => setConfirmRemove(member.email)}
                  className="p-2.5 rounded-xl text-muted hover:text-red-600 hover:bg-red-50 transition-colors shrink-0 cursor-pointer"
                  title="Remove member"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Remove Modal */}
      {confirmRemove && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmRemove(null)}
        >
          <div
            className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-primary mb-2">Remove Member</h3>
            <p className="text-sm text-secondary mb-1">
              Remove <span className="font-semibold">{permissions[confirmRemove]?.name}</span> from the team?
            </p>
            <p className="text-xs text-muted mb-4">
              They will see "Access Denied" on their next login. Their auth account cannot be deleted from here.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmRemove(null)}
                className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => removeMember(confirmRemove)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
