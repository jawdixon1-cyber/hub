import { useState } from 'react';
import {
  ArrowLeft, Shield, CheckSquare, FileSignature,
  ClipboardCheck, LogIn, Pencil,
  Check, ChevronRight, ChevronDown,
  Lightbulb, MessageSquare, GraduationCap, Trash2,
  Wrench, RotateCcw, AlertTriangle, UserCheck, UserX,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { ONBOARDING_STEPS } from './Training';

const PLAYBOOK_OPTIONS = [
  { key: 'service', label: 'Team Member', color: 'bg-emerald-100 text-emerald-700' },
  { key: 'leader', label: 'Leader', color: 'bg-amber-100 text-amber-700' },
  { key: 'sales', label: 'Sales Team', color: 'bg-purple-100 text-purple-700' },
  { key: 'strategy', label: 'General Manager', color: 'bg-blue-100 text-blue-700' },
];

const STATUS_COLORS = {
  New: 'bg-purple-100 text-purple-700',
  Reviewing: 'bg-amber-100 text-amber-700',
  Approved: 'bg-blue-100 text-blue-700',
  Implemented: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-red-100 text-red-700',
};

const TYPE_ICON = {
  idea: { Icon: Lightbulb, color: 'text-amber-500' },
  feedback: { Icon: MessageSquare, color: 'text-blue-500' },
  training: { Icon: GraduationCap, color: 'text-teal-500' },
  onboarding: { Icon: ClipboardCheck, color: 'text-orange-500' },
};

const STEP_ICONS = {
  'onboard-1': ClipboardCheck,
  'onboard-2': LogIn,
};

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

/* ── Component ── */

export default function TeamMemberDetail() {
  const navigate = useNavigate();
  const { memberEmail } = useParams();
  const { ownerMode } = useAuth();

  const permissions = useAppStore((s) => s.permissions);
  const suggestions = useAppStore((s) => s.suggestions);
  const setSuggestions = useAppStore((s) => s.setSuggestions);
  const trainingConfig = useAppStore((s) => s.trainingConfig);
  const setTrainingConfig = useAppStore((s) => s.setTrainingConfig);
  const setPermissions = useAppStore((s) => s.setPermissions);
  const equipment = useAppStore((s) => s.equipment);
  const equipmentRepairLog = useAppStore((s) => s.equipmentRepairLog);

  const [signatureModal, setSignatureModal] = useState(null);
  const [editPlaybooks, setEditPlaybooks] = useState(null); // null = not editing, array = editing
  const [editingRole, setEditingRole] = useState(false);
  const [roleInput, setRoleInput] = useState('');
  const [expandedStep, setExpandedStep] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmResetTraining, setConfirmResetTraining] = useState(false);
  const [confirmDontHire, setConfirmDontHire] = useState(false);
  const [resetToast, setResetToast] = useState(null);

  if (!ownerMode) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">Access denied.</p>
        <button onClick={() => navigate('/')} className="mt-4 text-sm text-blue-600 underline cursor-pointer">Go Home</button>
      </div>
    );
  }

  const email = decodeURIComponent(memberEmail);
  const memberData = permissions[email];

  if (!memberData) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">Team member not found.</p>
        <button onClick={() => navigate('/team')} className="mt-4 text-sm text-blue-600 underline cursor-pointer">Back to Team</button>
      </div>
    );
  }

  const name = memberData.name;
  const playbooks = memberData.playbooks || [];
  const role = memberData.role || 'Team Member';

  /* ── Data helpers ── */

  const getStepStatus = (stepId) => {
    const entry = suggestions.find(
      (s) => s.type === 'onboarding' && s.stepId === stepId && s.submittedBy === name
    );
    if (!entry) return { status: null, date: null, id: null };
    return { status: entry.status, date: entry.date, id: entry.id };
  };

  const getActionItems = (stepId) => {
    const team = playbooks[0] || 'service';
    const saved = trainingConfig?.onboardingSteps?.[team]?.[stepId]?.actionItems;
    return saved || getDefaultActionItems(stepId);
  };

  const getCompletions = (stepId) => {
    return trainingConfig?.actionCompletions?.[email]?.[stepId] || {};
  };

  const isFullyOnboarded = suggestions.some(
    (s) => s.type === 'onboarding' && s.stepId === 'onboard-2' && s.submittedBy === name && s.status === 'Approved'
  );

  // Name → email lookup for robust matching
  const nameToEmail = {};
  Object.entries(permissions || {}).forEach(([em, p]) => {
    if (p.name) nameToEmail[p.name.trim().toLowerCase()] = em;
  });

  const suggestionBelongsTo = (s, memberEmail, memberName) => {
    if (s.submittedByEmail === memberEmail) return true;
    const subName = s.submittedBy?.trim().toLowerCase() || '';
    const memName = memberName.trim().toLowerCase();
    if (subName === memName) return true;
    // Match "Ethan Brant" to "Ethan" (display_name vs permissions name)
    if (subName && memName && (subName.startsWith(memName + ' ') || memName.startsWith(subName + ' '))) return true;
    const resolved = nameToEmail[subName];
    if (resolved === memberEmail) return true;
    return false;
  };

  // All submissions by this member (ideas, feedback, onboarding, training)
  const memberSubmissions = suggestions.filter((s) => suggestionBelongsTo(s, email, name));
  const ideasAndFeedback = memberSubmissions.filter((s) => s.type === 'idea' || s.type === 'feedback');
  const trainingUpdates = memberSubmissions.filter((s) => s.type === 'training');

  // Overall action items stats
  const allActionStats = ONBOARDING_STEPS.reduce((acc, step) => {
    const items = getActionItems(step.id);
    const comps = getCompletions(step.id);
    acc.total += items.length;
    acc.done += items.filter((i) => comps[i.id]?.completed).length;
    acc.signed += items.filter((i) => comps[i.id]?.signature).length;
    return acc;
  }, { total: 0, done: 0, signed: 0 });

  /* ── Permissions editing ── */

  const startEditPlaybooks = () => setEditPlaybooks([...playbooks]);

  const togglePlaybook = (key) => {
    setEditPlaybooks((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const savePlaybooks = () => {
    if (!editPlaybooks) return;
    setPermissions((prev) => ({
      ...prev,
      [email]: { ...prev[email], playbooks: [...editPlaybooks] },
    }));
    setEditPlaybooks(null);
  };

  /* ── Suggestion status change ── */

  const handleStatus = (id, newStatus) => {
    setSuggestions(suggestions.map((s) => (s.id === id ? { ...s, status: newStatus } : s)));
  };

  const handleDelete = (id) => {
    if (confirm('Delete this submission?')) {
      setSuggestions(suggestions.filter((s) => s.id !== id));
    }
  };

  const handleInternalNote = (id, note) => {
    setSuggestions(suggestions.map((s) => (s.id === id ? { ...s, internalNote: note } : s)));
  };

  const removeMember = () => {
    const next = { ...permissions };
    delete next[email];
    setPermissions(next);
    navigate('/team');
  };

  /* ── Equipment repairs data ── */

  const activeRepairs = (equipment || []).filter(
    (item) => item.reportedBy === name && item.status === 'needs-repair'
  );
  const repairHistory = (equipmentRepairLog || []).filter(
    (entry) => entry.reportedBy === name
  );
  const totalRepairs = activeRepairs.length + repairHistory.length;

  /* ── Reset Training ── */

  const showToast = (msg) => {
    setResetToast(msg);
    setTimeout(() => setResetToast(null), 4000);
  };

  const handleResetTraining = () => {
    // 1. Clear action completions for this member
    const updated = { ...trainingConfig };
    if (updated.actionCompletions?.[email]) {
      updated.actionCompletions = { ...updated.actionCompletions };
      delete updated.actionCompletions[email];
    }
    setTrainingConfig(updated);

    // 2. Remove onboarding & training suggestions submitted by this member
    const filtered = suggestions.filter(
      (s) =>
        !((s.type === 'onboarding' || s.type === 'training') &&
          suggestionBelongsTo(s, email, name))
    );
    setSuggestions(filtered);

    setConfirmResetTraining(false);
    showToast(`Training reset for ${name}`);
  };

  /* ── Hiring decision ── */

  const step1Status = getStepStatus('onboard-1');
  const step1Submitted = step1Status.status && step1Status.status !== 'Approved';
  const step1Approved = step1Status.status === 'Approved';

  // Check if all step 1 action items are done (even if not yet submitted)
  const step1Items = getActionItems('onboard-1');
  const step1Completions = getCompletions('onboard-1');
  const step1AllDone = step1Items.length > 0 && step1Items.every((i) => step1Completions[i.id]?.completed);

  // Show hiring decision when step 1 actions are complete OR submitted, but not yet approved
  const needsHiringDecision = !step1Approved && (step1Submitted || step1AllDone);

  const handleHire = () => {
    if (step1Status.id) {
      // Approve existing submission
      handleStatus(step1Status.id, 'Approved');
    } else {
      // No submission yet but all items done — create an approved submission
      const today = new Date().toLocaleDateString('en-US');
      setSuggestions([
        ...suggestions,
        {
          id: `hire-${Date.now()}`,
          type: 'onboarding',
          stepId: 'onboard-1',
          title: `${name} – Test Day Prep Complete`,
          description: 'Approved via hiring decision.',
          submittedBy: name,
          submittedByEmail: email,
          date: today,
          status: 'Approved',
          internalNote: '',
        },
      ]);
    }
    showToast(`${name} has been hired! Onboarding unlocked.`);
  };

  const handleDontHire = () => {
    // Remove the member from the team
    const next = { ...permissions };
    delete next[email];
    setPermissions(next);
    navigate('/team');
  };

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate('/team')}
        className="inline-flex items-center gap-1.5 text-sm text-tertiary hover:text-secondary transition-colors cursor-pointer"
      >
        <ArrowLeft size={16} />
        Back to Team
      </button>

      {/* ── Profile Header ── */}
      <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6">
        <div className="flex items-start gap-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold shrink-0 ${
            isFullyOnboarded ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-light text-brand-text-strong'
          }`}>
            {getInitials(name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-primary">{name}</h1>
              {editingRole ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={roleInput}
                    onChange={(e) => setRoleInput(e.target.value)}
                    className="px-2 py-0.5 rounded-lg border border-border-strong text-xs font-medium text-primary w-28 outline-none focus:ring-1 focus:ring-brand"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setPermissions((prev) => ({ ...prev, [email]: { ...prev[email], role: roleInput.trim() || undefined } }));
                        setEditingRole(false);
                      }
                      if (e.key === 'Escape') setEditingRole(false);
                    }}
                  />
                  <button
                    onClick={() => {
                      setPermissions((prev) => ({ ...prev, [email]: { ...prev[email], role: roleInput.trim() || undefined } }));
                      setEditingRole(false);
                    }}
                    className="p-1 rounded-lg text-brand-text hover:bg-brand-light cursor-pointer"
                  >
                    <Check size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setRoleInput(role); setEditingRole(true); }}
                  className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:opacity-80 cursor-pointer"
                  title="Click to edit role"
                >
                  {role}
                </button>
              )}
              {isFullyOnboarded && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  Onboarded
                </span>
              )}
            </div>
            <p className="text-sm text-tertiary mt-0.5">{email}</p>

            {/* Team badges */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {editPlaybooks ? (
                <>
                  {PLAYBOOK_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => togglePlaybook(opt.key)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border cursor-pointer ${
                        editPlaybooks.includes(opt.key)
                          ? `${opt.color} border-current`
                          : 'bg-surface text-muted border-border-default'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <button onClick={savePlaybooks} className="p-1.5 rounded-lg text-brand-text hover:bg-brand-light cursor-pointer" title="Save">
                    <Check size={16} />
                  </button>
                  <button onClick={() => setEditPlaybooks(null)} className="p-1.5 rounded-lg text-muted hover:bg-surface cursor-pointer" title="Cancel">
                    <ArrowLeft size={14} />
                  </button>
                </>
              ) : (
                <>
                  {playbooks.map((key) => {
                    const opt = PLAYBOOK_OPTIONS.find((o) => o.key === key);
                    return opt ? (
                      <span key={key} className={`px-2.5 py-0.5 rounded-md text-xs font-medium ${opt.color}`}>
                        {opt.label}
                      </span>
                    ) : null;
                  })}
                  {playbooks.length === 0 && <span className="text-xs text-muted">No playbook access</span>}
                  <button onClick={startEditPlaybooks} className="p-1 rounded-lg text-muted hover:text-brand-text hover:bg-brand-light transition-colors cursor-pointer" title="Edit permissions">
                    <Pencil size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={() => setConfirmResetTraining(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors cursor-pointer"
          >
            <RotateCcw size={13} />
            Reset Training
          </button>
          <button
            onClick={() => setConfirmRemove(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
          >
            <Trash2 size={13} />
            Remove from Team
          </button>
        </div>

        {/* Summary stats row */}
        <div className="grid grid-cols-4 gap-3 mt-5 pt-5 border-t border-border-subtle">
          <div className="text-center">
            <p className="text-lg font-bold text-primary">{allActionStats.done}/{allActionStats.total}</p>
            <p className="text-[10px] text-tertiary font-medium">Actions Done</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-primary">{allActionStats.signed}</p>
            <p className="text-[10px] text-tertiary font-medium">Policies Signed</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-primary">{ideasAndFeedback.length + trainingUpdates.length}</p>
            <p className="text-[10px] text-tertiary font-medium">Submissions</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-primary">{totalRepairs}</p>
            <p className="text-[10px] text-tertiary font-medium">Repairs</p>
          </div>
        </div>
      </div>

      {/* ── Hiring Decision Banner ── */}
      {needsHiringDecision && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-2xl border-2 border-amber-300 dark:border-amber-700 p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
              <ClipboardCheck size={20} className="text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-primary text-lg">Hiring Decision Required</h3>
              <p className="text-sm text-secondary mt-0.5">
                <span className="font-semibold">{name}</span> has completed Test Day Prep.
                {step1Submitted ? ' Their submission is awaiting your review.' : ' All action items are finished.'}
              </p>
              <p className="text-xs text-tertiary mt-1">
                Hiring will unlock the remaining onboarding steps (Logins, Company Policies, Playbook Review).
              </p>
              <div className="flex flex-wrap gap-3 mt-4">
                <button
                  onClick={handleHire}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors cursor-pointer shadow-sm"
                >
                  <UserCheck size={16} />
                  Hire — Unlock Onboarding
                </button>
                <button
                  onClick={() => setConfirmDontHire(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors cursor-pointer"
                >
                  <UserX size={16} />
                  Don't Hire
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Onboarding Progress ── */}
      <div>
        <h2 className="text-sm font-bold text-secondary uppercase tracking-wider mb-3">Onboarding Progress</h2>
        <div className="space-y-3">
          {ONBOARDING_STEPS.map((step) => {
            const StepIcon = STEP_ICONS[step.id] || ClipboardCheck;
            const { status, date } = getStepStatus(step.id);
            const items = getActionItems(step.id);
            const completions = getCompletions(step.id);
            const completedCount = items.filter((i) => completions[i.id]?.completed).length;
            const isExpanded = expandedStep === step.id;

            return (
              <div key={step.id} className="bg-card rounded-2xl shadow-sm border border-border-subtle overflow-hidden">
                {/* Step header - always visible */}
                <button
                  onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                  className="w-full flex items-center gap-3 p-4 text-left cursor-pointer hover:bg-surface-alt/50 transition-colors"
                >
                  <div className={`w-9 h-9 rounded-xl ${step.bg} ${step.borderColor} border flex items-center justify-center shrink-0`}>
                    <StepIcon size={16} className={step.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-primary">{step.title}</span>
                    {items.length > 0 && (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-surface-alt rounded-full overflow-hidden max-w-[120px]">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all"
                            style={{ width: `${items.length > 0 ? (completedCount / items.length) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted">{completedCount}/{items.length}</span>
                      </div>
                    )}
                  </div>
                  {status === 'Approved' ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                      <Check size={10} /> Complete
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 shrink-0">
                      Not Started
                    </span>
                  )}
                  <ChevronDown size={16} className={`text-muted shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {/* Expanded action items */}
                {isExpanded && (
                  <div className="border-t border-border-subtle px-4 pb-4 pt-3">
                    {status && status !== 'Approved' && (
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[11px] text-tertiary">Submitted: {date}</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleStatus(getStepStatus(step.id).id, 'Approved'); }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors cursor-pointer"
                        >
                          <Check size={12} />
                          Approve
                        </button>
                      </div>
                    )}
                    {items.length > 0 ? (
                      <div className="space-y-1.5">
                        {items.map((item) => {
                          const comp = completions[item.id];
                          const done = comp?.completed;
                          return (
                            <div key={item.id} className="flex items-center gap-2 py-1">
                              <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                                done ? 'bg-emerald-500' : 'border border-gray-300 dark:border-gray-600'
                              }`}>
                                {done && <Check size={10} className="text-white" />}
                              </div>
                              {item.type === 'policy' ? (
                                <Shield size={12} className={done ? 'text-emerald-600 shrink-0' : 'text-amber-500 shrink-0'} />
                              ) : (
                                <CheckSquare size={12} className={done ? 'text-emerald-600 shrink-0' : 'text-gray-400 shrink-0'} />
                              )}
                              <span className={`text-sm flex-1 ${done ? 'text-secondary line-through' : 'text-primary'}`}>
                                {item.label}
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                {done && comp?.date && (
                                  <span className="text-[11px] text-muted">{comp.date}</span>
                                )}
                                {done && comp?.signature && (
                                  <button
                                    onClick={() => setSignatureModal({ name: `${name} — ${item.label}`, dataUrl: comp.signature })}
                                    className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                                  >
                                    <FileSignature size={12} />
                                    View Signature
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted">No action items configured for this step.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Ideas & Feedback ── */}
      <div>
        <h2 className="text-sm font-bold text-secondary uppercase tracking-wider mb-3">
          Ideas &amp; Feedback ({ideasAndFeedback.length})
        </h2>
        {ideasAndFeedback.length === 0 ? (
          <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 text-center">
            <Lightbulb size={28} className="text-muted mx-auto mb-2" />
            <p className="text-sm text-muted">No ideas or feedback submitted yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {ideasAndFeedback.map((item) => {
              const typeInfo = TYPE_ICON[item.type] || TYPE_ICON.idea;
              const ItemIcon = typeInfo.Icon;
              return (
                <div key={item.id} className="bg-card rounded-2xl shadow-sm border border-border-subtle p-4">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <ItemIcon size={14} className={`${typeInfo.color} shrink-0`} />
                    <h3 className="text-sm font-bold text-primary">{item.title}</h3>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status] || 'bg-surface-alt text-secondary'}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="text-xs text-secondary mt-1 whitespace-pre-line line-clamp-3">{item.description}</p>
                  <p className="text-[10px] text-muted mt-2">{item.date}</p>
                  {/* Owner status controls */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['New', 'Reviewing', 'Approved', 'Implemented', 'Rejected']
                      .filter((s) => s !== item.status)
                      .map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStatus(item.id, s)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${STATUS_COLORS[s]} hover:opacity-80`}
                        >
                          {s}
                        </button>
                      ))}
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg bg-red-50 text-red-600 text-[10px] font-semibold hover:bg-red-100 transition-colors cursor-pointer"
                    >
                      <Trash2 size={10} />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Training Updates ── */}
      <div>
        <h2 className="text-sm font-bold text-secondary uppercase tracking-wider mb-3">
          Training Updates ({trainingUpdates.length})
        </h2>
        {trainingUpdates.length === 0 ? (
          <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 text-center">
            <GraduationCap size={28} className="text-muted mx-auto mb-2" />
            <p className="text-sm text-muted">No training updates submitted yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {trainingUpdates.map((update) => (
              <div key={update.id} className="bg-card rounded-2xl shadow-sm border border-border-subtle p-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <GraduationCap size={14} className="text-teal-500 shrink-0" />
                    <span className="text-sm font-semibold text-primary truncate">{update.title}</span>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[update.status] || 'bg-surface-alt text-secondary'}`}>
                    {update.status}
                  </span>
                </div>
                <p className="text-[10px] text-muted">{update.date}</p>
                {update.description && (
                  <p className="text-xs text-secondary mt-1.5 whitespace-pre-wrap">{update.description}</p>
                )}
                {/* Owner status controls */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['New', 'Reviewing', 'Approved', 'Implemented', 'Rejected']
                    .filter((s) => s !== update.status)
                    .map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStatus(update.id, s)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${STATUS_COLORS[s]} hover:opacity-80`}
                      >
                        {s}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>


      {/* ── Equipment Repairs ── */}
      <div>
        <h2 className="text-sm font-bold text-secondary uppercase tracking-wider mb-3">
          Equipment Repairs ({totalRepairs})
        </h2>
        {totalRepairs === 0 ? (
          <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 text-center">
            <Wrench size={28} className="text-muted mx-auto mb-2" />
            <p className="text-sm text-muted">No equipment repairs reported by this member.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Active repair reports */}
            {activeRepairs.map((item) => (
              <div key={item.id} className="bg-card rounded-2xl shadow-sm border border-red-200 dark:border-red-800 p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Wrench size={14} className="text-red-500 shrink-0" />
                  <span className="text-sm font-bold text-primary">{item.name}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400">
                    Needs Repair
                  </span>
                  {item.urgency && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      item.urgency === 'critical'
                        ? 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400'
                        : 'bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
                    }`}>
                      {item.urgency}
                    </span>
                  )}
                </div>
                {item.reportedIssue && (
                  <p className="text-xs text-secondary mt-1">{item.reportedIssue}</p>
                )}
                {item.reportedDate && (
                  <p className="text-[10px] text-muted mt-1">Reported: {item.reportedDate}</p>
                )}
              </div>
            ))}

            {/* Completed repair history */}
            {repairHistory.map((entry) => (
              <div key={entry.id} className="bg-card rounded-2xl shadow-sm border border-border-subtle p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Wrench size={14} className="text-emerald-500 shrink-0" />
                  <span className="text-sm font-bold text-primary">{entry.equipmentName}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">
                    Repaired
                  </span>
                  {entry.urgency && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      entry.urgency === 'critical'
                        ? 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400'
                        : 'bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
                    }`}>
                      {entry.urgency}
                    </span>
                  )}
                </div>
                {entry.issue && (
                  <p className="text-xs text-secondary mt-1">{entry.issue}</p>
                )}
                <div className="flex gap-3 mt-1">
                  {entry.reportedDate && (
                    <p className="text-[10px] text-muted">Reported: {entry.reportedDate}</p>
                  )}
                  {entry.repairedDate && (
                    <p className="text-[10px] text-muted">Repaired: {entry.repairedDate}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Toast ── */}
      {resetToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium shadow-lg flex items-center gap-2 max-w-sm text-center">
          <Check size={16} className="shrink-0" />
          {resetToast}
        </div>
      )}

      {/* ── Confirm Reset Training Modal ── */}
      {confirmResetTraining && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmResetTraining(false)}>
          <div className="bg-card rounded-2xl shadow-2xl border border-border-subtle max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-primary">Reset Training?</h3>
                <p className="text-sm text-secondary">
                  This will clear all onboarding and training progress for{' '}
                  <span className="font-semibold">{name}</span>.
                </p>
              </div>
            </div>
            <p className="text-xs text-tertiary">
              Action item completions, signatures, and submitted onboarding/training updates will be permanently removed.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmResetTraining(false)}
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

      {/* ── Confirm Remove Modal ── */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmRemove(false)}>
          <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-primary mb-2">Remove Member</h3>
            <p className="text-sm text-secondary mb-1">
              Remove <span className="font-semibold">{name}</span> from the team?
            </p>
            <p className="text-xs text-muted mb-4">
              They will see "Access Denied" on their next login. Their auth account cannot be deleted from here.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmRemove(false)}
                className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={removeMember}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Don't Hire Modal ── */}
      {confirmDontHire && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDontHire(false)}>
          <div className="bg-card rounded-2xl shadow-2xl border border-border-subtle max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center shrink-0">
                <UserX size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-primary">Don't Hire?</h3>
                <p className="text-sm text-secondary">
                  This will remove <span className="font-semibold">{name}</span> from the team.
                </p>
              </div>
            </div>
            <p className="text-xs text-tertiary">
              They will lose access to the app and see "Access Denied" on their next login.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDontHire(false)}
                className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDontHire}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer"
              >
                Remove from Team
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Signature Viewer Modal ── */}
      {signatureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSignatureModal(null)}>
          <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-primary mb-3">{signatureModal.name}</h3>
            <div className="bg-white dark:bg-surface-alt rounded-lg border border-border-subtle p-2">
              <img src={signatureModal.dataUrl} alt="Signature" className="w-full h-auto rounded" />
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setSignatureModal(null)}
                className="px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-medium hover:bg-brand-hover transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
