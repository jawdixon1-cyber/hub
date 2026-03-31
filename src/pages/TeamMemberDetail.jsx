import { useState } from 'react';
import {
  ArrowLeft, Shield, CheckSquare, FileSignature,
  ClipboardCheck, LogIn, Pencil,
  Check, ChevronRight, ChevronDown,
  Lightbulb, MessageSquare, GraduationCap, Trash2,
  Wrench, RotateCcw, AlertTriangle, UserCheck, UserX,
  AlertOctagon,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { ONBOARDING_STEPS } from './Training';
import { getActiveRepairs, genId } from '../data';
import { getTodayInTimezone } from '../utils/timezone';

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
  const strikes = useAppStore((s) => s.strikes);
  const setStrikes = useAppStore((s) => s.setStrikes);

  const [signatureModal, setSignatureModal] = useState(null);
  const [showStrikeForm, setShowStrikeForm] = useState(false);
  const [strikeReason, setStrikeReason] = useState('');
  const [strikeNotes, setStrikeNotes] = useState('');
  const [strikeDate, setStrikeDate] = useState(new Date().toISOString().split('T')[0]);
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

  const activeRepairs = (equipment || [])
    .filter((item) => item.status === 'needs-repair')
    .flatMap((item) => {
      return getActiveRepairs(item)
        .filter((r) => r.reportedBy === name)
        .map((r) => ({
          id: r.id,
          name: item.name,
          reportedIssue: r.issue,
          reportedBy: r.reportedBy,
          reportedDate: r.reportedDate,
          urgency: r.urgency,
          status: 'needs-repair',
        }));
    });
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
      const today = getTodayInTimezone();
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
            onClick={() => setConfirmRemove(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
          >
            <Trash2 size={13} />
            Remove from Team
          </button>
        </div>
      </div>

      {/* ── Strikes / Discipline ── */}
      {(() => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const memberStrikes = (strikes || []).filter((s) => s.memberEmail === email);
        const activeStrikes = memberStrikes.filter((s) => s.issuedAt >= thirtyDaysAgo);
        const activeCount = activeStrikes.length;

        const handleIssueStrike = () => {
          if (!strikeReason.trim()) return;
          const newStrike = {
            id: genId(),
            memberEmail: email,
            memberName: name,
            reason: strikeReason.trim(),
            notes: strikeNotes.trim(),
            issuedAt: new Date(strikeDate + 'T12:00:00').toISOString(),
            issuedBy: 'Jude Wilson',
            acknowledged: false,
            acknowledgedAt: null,
            signatureDataUrl: null,
          };
          setStrikes([...(strikes || []), newStrike]);
          setStrikeReason('');
          setStrikeNotes('');
          setStrikeDate(new Date().toISOString().split('T')[0]);
          setShowStrikeForm(false);
        };

        return (
          <div>
            <h2 className="text-sm font-bold text-secondary uppercase tracking-wider mb-3">
              Strikes / Discipline ({memberStrikes.length})
            </h2>

            {/* 3 strikes alert */}
            {activeCount >= 3 && (
              <div className="mb-3 bg-red-500/10 border-2 border-red-500/40 rounded-2xl p-4 flex items-center gap-3">
                <AlertOctagon size={24} className="text-red-500 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-600 dark:text-red-400">3 STRIKES — Termination Eligible</p>
                  <p className="text-xs text-red-500/80">{name} has {activeCount} strike{activeCount !== 1 ? 's' : ''} within the last 30 days.</p>
                </div>
              </div>
            )}

            {/* 2 strikes warning */}
            {activeCount === 2 && (
              <div className="mb-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3">
                <AlertTriangle size={20} className="text-amber-500 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-600 dark:text-amber-400">Warning: 2 Active Strikes</p>
                  <p className="text-xs text-amber-500/80">One more strike within 30 days may result in termination.</p>
                </div>
              </div>
            )}

            {/* Issue strike button / form */}
            {!showStrikeForm ? (
              <button
                onClick={() => setShowStrikeForm(true)}
                className="mb-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 text-sm font-semibold hover:bg-red-500/20 transition-colors cursor-pointer"
              >
                <AlertOctagon size={14} />
                Issue Strike
              </button>
            ) : (
              <div className="mb-3 bg-red-500/5 border border-red-500/20 rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-red-600 dark:text-red-400">Issue New Strike</h3>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Date</label>
                  <input
                    type="date"
                    value={strikeDate}
                    onChange={(e) => setStrikeDate(e.target.value)}
                    className="w-full rounded-xl border border-border-default px-4 py-2.5 text-sm text-primary focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Reason</label>
                  <input
                    type="text"
                    value={strikeReason}
                    onChange={(e) => setStrikeReason(e.target.value)}
                    placeholder="e.g. No call / no show"
                    className="w-full rounded-xl border border-border-default px-4 py-2.5 text-sm text-primary placeholder-placeholder-muted focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Notes (optional)</label>
                  <textarea
                    value={strikeNotes}
                    onChange={(e) => setStrikeNotes(e.target.value)}
                    placeholder="Additional context..."
                    rows={3}
                    className="w-full rounded-xl border border-border-default px-4 py-2.5 text-sm text-primary placeholder-placeholder-muted focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none transition resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleIssueStrike}
                    disabled={!strikeReason.trim()}
                    className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Issue Strike
                  </button>
                  <button
                    onClick={() => { setShowStrikeForm(false); setStrikeReason(''); setStrikeNotes(''); setStrikeDate(new Date().toISOString().split('T')[0]); }}
                    className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Strike history */}
            {memberStrikes.length === 0 ? (
              <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 text-center">
                <AlertOctagon size={28} className="text-muted mx-auto mb-2" />
                <p className="text-sm text-muted">No strikes on record.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {[...memberStrikes].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).map((strike) => {
                  const isActive = strike.issuedAt >= thirtyDaysAgo;
                  return (
                    <div key={strike.id} className={`bg-card rounded-2xl shadow-sm border p-4 ${isActive ? 'border-red-200 dark:border-red-800' : 'border-border-subtle'}`}>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <AlertOctagon size={14} className={isActive ? 'text-red-500' : 'text-muted'} />
                        <span className="text-sm font-bold text-primary">{strike.reason}</span>
                        {strike.acknowledged ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                            <Check size={10} />
                            Signed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                            Pending
                          </span>
                        )}
                        {!isActive && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            Expired
                          </span>
                        )}
                      </div>
                      {strike.notes && (
                        <p className="text-xs text-secondary mt-1">{strike.notes}</p>
                      )}
                      <div className="flex gap-3 mt-1 flex-wrap">
                        <p className="text-[10px] text-muted">
                          Issued: {new Date(strike.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        <p className="text-[10px] text-muted">By: {strike.issuedBy}</p>
                        {strike.acknowledged && strike.acknowledgedAt && (
                          <p className="text-[10px] text-muted">
                            Acknowledged: {new Date(strike.acknowledgedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <button
                          onClick={() => { if (confirm('Delete this strike?')) setStrikes((strikes || []).filter((s) => s.id !== strike.id)); }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-red-500 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 size={11} /> Delete
                        </button>
                      {strike.acknowledged && strike.signatureDataUrl && (
                        <button
                          onClick={() => setSignatureModal({ name: `${name} — Strike: ${strike.reason}`, dataUrl: strike.signatureDataUrl })}
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
            )}
          </div>
        );
      })()}

      {/* ── Toast ── */}
      {resetToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium shadow-lg flex items-center gap-2 max-w-sm text-center">
          <Check size={16} className="shrink-0" />
          {resetToast}
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
