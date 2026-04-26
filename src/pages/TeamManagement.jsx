import { useState, useEffect, lazy, Suspense } from 'react';
import {
  ArrowLeft, ChevronRight, ChevronUp, Plus,
  Users, Shield, CheckSquare,
  ClipboardCheck, UserCheck, FileCheck,
  Check, Clock, Eye, EyeOff, Trash2, AlertCircle, KeyRound, X, FileText,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { ONBOARDING_STEPS } from '../utils/onboarding';

const TeamAgreement = lazy(() => import('./TeamAgreement'));

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
  const strikes = useAppStore((s) => s.strikes);
  const presence = useAppStore((s) => s.presence);
  const signedAgreements = useAppStore((s) => s.signedAgreements) || [];
  const agreementConfig = useAppStore((s) => s.agreementConfig);
  const currentAgreementVersion = agreementConfig?.version || null;

  // Add member form state
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPlaybooks, setSelectedPlaybooks] = useState(['service']);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [editingPayFor, setEditingPayFor] = useState(null);
  const [payDraft, setPayDraft] = useState('');

  // Auth user list (for last sign-in info)
  const [authUsers, setAuthUsers] = useState([]);

  // Reset password state — keyed by member email
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState('');

  // Fetch auth user list on mount
  useEffect(() => {
    fetch('/api/team-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list' }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.users) setAuthUsers(d.users); })
      .catch(() => {});
  }, []);

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

  const realMembers = Object.entries(permissions).map(([memberEmail, data]) => ({
    email: memberEmail,
    name: data.name,
    playbooks: data.playbooks || [],
    roleId: data.roleId || null,
    payRate: data.payRate || null,
  }));

  // Trial applicants — already have a Hub login, awaiting hire decision
  const applications = useAppStore((s) => s.applications) || [];
  const trialMembers = applications
    .filter((a) => a.status === 'onboarding' && (a.data?.email || a.onboarding?.loginEmail))
    .map((a) => ({
      email: (a.onboarding?.loginEmail || a.data?.email || '').toLowerCase(),
      name: a.data?.name || [a.data?.first_name, a.data?.last_name].filter(Boolean).join(' ') || 'Applicant',
      playbooks: ['service'],
      roleId: a.onboarding?.roleId || null,
      isTrial: true,
      applicantId: a.id,
      trialStart: a.onboarding?.trialStart || a.onboarding?.trialDate || null,
      trialEnd: a.onboarding?.trialEnd || null,
      payRate: a.onboarding?.trialPayRate || a.onboarding?.payRate || null,
    }));

  const members = [...realMembers, ...trialMembers];

  // Roles from store (for the role picker)
  const rolesData = useAppStore((s) => s.roles);
  const allRoles = (rolesData && rolesData.items) ? rolesData.items : [];

  const updateMemberRole = (memberEmail, newRoleId) => {
    setPermissions({
      ...permissions,
      [memberEmail]: {
        ...permissions[memberEmail],
        roleId: newRoleId,
      },
    });
  };

  const setApplications = useAppStore((s) => s.setApplications);
  const savePayRate = (member, rawValue) => {
    const n = parseFloat(rawValue);
    const value = isNaN(n) || n <= 0 ? null : n;
    if (member.isTrial) {
      setApplications(applications.map((a) => a.id === member.applicantId
        ? { ...a, onboarding: { ...(a.onboarding || {}), trialPayRate: value } }
        : a));
    } else {
      setPermissions({
        ...permissions,
        [member.email]: { ...permissions[member.email], payRate: value },
      });
    }
    setEditingPayFor(null);
    setPayDraft('');
  };

  // Helper to find auth user by email
  const getAuthUser = (memberEmail) =>
    authUsers.find((u) => u.email?.toLowerCase() === memberEmail?.toLowerCase());

  /* ── Add member helpers ── */

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setSelectedPlaybooks(['service']);
    setFormError('');
    setFormSuccess('');
  };

  const togglePlaybook = (key) => {
    setSelectedPlaybooks((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

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
      const res = await fetch('/api/team-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          email: trimmedEmail,
          password,
          displayName: trimmedName,
        }),
      });
      const data = await res.json();

      if (data.error) {
        // If user already exists in auth, still add to permissions
        if (data.error.includes('already been registered') || data.error.includes('already exists')) {
          setPermissions({
            ...permissions,
            [trimmedEmail]: { name: trimmedName, playbooks: selectedPlaybooks },
          });
          setFormSuccess(`${trimmedName} added (auth account already existed).`);
          resetForm();
          setShowForm(false);
          return;
        }
        setFormError(data.error);
        return;
      }

      // Add to permissions store
      setPermissions({
        ...permissions,
        [trimmedEmail]: { name: trimmedName, playbooks: selectedPlaybooks },
      });

      // Add to local auth users list
      if (data.user) {
        setAuthUsers((prev) => [...prev, {
          id: data.user.id,
          email: trimmedEmail,
          name: trimmedName,
          role: 'member',
          createdAt: new Date().toISOString(),
          lastSignIn: null,
        }]);
      }

      setFormSuccess(`${trimmedName} created successfully!`);
      resetForm();
      setTimeout(() => { setShowForm(false); setFormSuccess(''); }, 1500);
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setFormLoading(false);
    }
  };

  const removeMember = async (memberEmail) => {
    setRemoveLoading(true);
    try {
      // Try to delete the auth user too
      const authUser = getAuthUser(memberEmail);
      if (authUser?.id) {
        await fetch('/api/team-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', userId: authUser.id }),
        });
        // Remove from local auth users
        setAuthUsers((prev) => prev.filter((u) => u.id !== authUser.id));
      }
    } catch {
      // Continue even if auth delete fails — still remove from permissions
    }

    // Remove from permissions store
    const next = { ...permissions };
    delete next[memberEmail];
    setPermissions(next);
    setConfirmRemove(null);
    setRemoveLoading(false);
  };

  const handleResetPassword = async (memberEmail) => {
    if (!resetPassword || resetPassword.length < 6) {
      setResetMsg('Password must be at least 6 characters.');
      return;
    }

    const authUser = getAuthUser(memberEmail);
    if (!authUser?.id) {
      setResetMsg('Could not find auth account for this user.');
      return;
    }

    setResetLoading(true);
    setResetMsg('');
    try {
      const res = await fetch('/api/team-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resetPassword',
          userId: authUser.id,
          newPassword: resetPassword,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setResetMsg(data.error);
      } else {
        setResetMsg('Password reset successfully!');
        setTimeout(() => { setResetTarget(null); setResetPassword(''); setResetMsg(''); }, 1500);
      }
    } catch {
      setResetMsg('Network error.');
    } finally {
      setResetLoading(false);
    }
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

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-primary">Team</h1>
          <button
            onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand font-medium text-sm hover:bg-brand-hover transition-colors cursor-pointer"
          >
            {showForm ? <ChevronUp size={18} /> : <Plus size={18} />}
            {showForm ? 'Close' : 'Add Member'}
          </button>
        </div>
      </div>

      <div>
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
            {formSuccess && (
              <p className="text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">{formSuccess}</p>
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


      {/* Member List */}
      {members.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-8 text-center">
          <p className="text-muted text-sm">No team members added yet.</p>
          <p className="text-xs text-tertiary mt-2">Use the "Add Member" button above to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((member) => {
            const authUser = getAuthUser(member.email);
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const activeStrikeCount = (strikes || []).filter(
              (s) => s.memberEmail === member.email && s.issuedAt >= thirtyDaysAgo
            ).length;
            const roleName = member.roleId ? (allRoles.find((r) => r.id === member.roleId)?.name || null) : null;
            const memberSigned = signedAgreements.some((a) => a.memberEmail === member.email && (!currentAgreementVersion || a.version === currentAgreementVersion));

            return (
              <div key={member.email + (member.isTrial ? '-trial' : '')} className="space-y-0">
                <div className="flex items-center gap-2">
                  <div
                    onClick={() => navigate(`/team/${encodeURIComponent(member.email)}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/team/${encodeURIComponent(member.email)}`); }}
                    className="flex-1 bg-card rounded-2xl shadow-sm border border-border-subtle overflow-hidden flex items-center gap-4 px-5 py-4 text-left cursor-pointer hover:border-border-strong hover:shadow-md transition-all group"
                  >
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold bg-brand-light text-brand-text-strong">
                        {getInitials(member.name)}
                      </div>
                      {(() => {
                        const p = (presence || {})[member.email];
                        const isOnline = p?.status === 'online' && p?.lastSeen && (Date.now() - new Date(p.lastSeen).getTime()) < 300000;
                        return <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card ${isOnline ? 'bg-emerald-500' : 'bg-gray-400'}`} />;
                      })()}
                    </div>

                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      <h3 className="font-bold text-lg text-primary truncate">{member.name}</h3>
                      {activeStrikeCount === 1 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500">1 strike</span>}
                      {activeStrikeCount === 2 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-500">2 strikes</span>}
                      {activeStrikeCount >= 3 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-500">3 STRIKES</span>}
                    </div>

                    <div className="hidden sm:flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {editingPayFor === member.email ? (
                        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-card border border-brand">
                          <span className="text-xs text-muted">$</span>
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            autoFocus
                            value={payDraft}
                            onChange={(e) => setPayDraft(e.target.value)}
                            onBlur={() => savePayRate(member, payDraft)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') savePayRate(member, payDraft);
                              if (e.key === 'Escape') { setEditingPayFor(null); setPayDraft(''); }
                            }}
                            className="w-16 bg-transparent text-xs font-bold text-primary outline-none"
                            placeholder="16.00"
                          />
                          <span className="text-xs text-muted">/hr</span>
                        </div>
                      ) : member.payRate ? (
                        <button
                          onClick={() => { setEditingPayFor(member.email); setPayDraft(String(member.payRate)); }}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 cursor-pointer"
                        >
                          ${Number(member.payRate).toFixed(2)}/hr
                        </button>
                      ) : (
                        <button
                          onClick={() => { setEditingPayFor(member.email); setPayDraft(''); }}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 cursor-pointer"
                        >
                          Set pay
                        </button>
                      )}
                      {roleName ? (
                        <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-surface-alt text-secondary border border-border-subtle">{roleName}</span>
                      ) : (
                        <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-500">No role</span>
                      )}
                      {memberSigned ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-500">
                          <Check size={12} /> Signed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-red-500/15 text-red-500">
                          <AlertCircle size={12} /> Not signed
                        </span>
                      )}
                    </div>

                    <ChevronRight size={20} className="text-muted shrink-0 group-hover:text-secondary transition-colors" />
                  </div>
                </div>
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
              This will remove their team access and delete their auth account.
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
                disabled={removeLoading}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {removeLoading ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Team Agreement — embedded below members */}
    <div className="pt-4 border-t border-border-subtle">
      <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-brand-light border-t-brand rounded-full animate-spin" /></div>}>
        <TeamAgreement />
      </Suspense>
    </div>
    </div>
  );
}
