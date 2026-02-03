import { useState } from 'react';
import {
  LogOut, Shield, User, Lightbulb, MessageSquare,
  Plus, X, ClipboardCheck, LogIn,
  GraduationCap, Check, Lock, ArrowRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { ONBOARDING_STEPS, MODULE_LIST, isOnboardingComplete } from './Training';
import { SettingsContent } from './Settings';
import { genId } from '../data';

const PLAYBOOK_OPTIONS = [
  { key: 'service', label: 'Field Team', color: 'bg-emerald-100 text-emerald-700' },
  { key: 'sales', label: 'Sales Team', color: 'bg-purple-100 text-purple-700' },
  { key: 'strategy', label: 'General Manager', color: 'bg-blue-100 text-blue-700' },
];

const STEP_ICONS = {
  'onboard-1': ClipboardCheck,
  'onboard-2': LogIn,
};

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

/* ── Kanban Column ── */

function KanbanColumn({ title, count, color, items, highlight }) {
  return (
    <div className={`rounded-2xl border overflow-hidden ${highlight && count > 0 ? 'border-emerald-200 dark:border-emerald-800' : 'border-border-subtle'}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-alt">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-xs font-bold text-secondary">{title}</span>
        <span className="text-[10px] text-muted ml-auto">{count}</span>
      </div>
      <div className="p-2 space-y-2 min-h-[60px]">
        {items.length === 0 ? (
          <p className="text-[10px] text-muted text-center py-3">None yet</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className={`bg-card rounded-xl p-3 shadow-sm ${highlight && item.status === 'Implemented' ? 'ring-1 ring-emerald-200 dark:ring-emerald-800' : ''}`}>
              <div className="flex items-center gap-1.5 mb-1">
                {item.type === 'idea'
                  ? <Lightbulb size={11} className="text-amber-500 shrink-0" />
                  : <MessageSquare size={11} className="text-blue-500 shrink-0" />}
                <span className="text-xs font-semibold text-primary truncate">{item.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted">{item.date}</span>
                {item.status === 'Implemented' && (
                  <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                    <Check size={9} /> Implemented
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ── Main Component ── */

export default function Profile() {
  const navigate = useNavigate();
  const { currentUser, user, ownerMode, signOut } = useAuth();
  const suggestions = useAppStore((s) => s.suggestions);
  const setSuggestions = useAppStore((s) => s.setSuggestions);
  const trainingConfig = useAppStore((s) => s.trainingConfig);
  const permissions = useAppStore((s) => s.permissions);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ type: 'idea', title: '', description: '' });

  const handleSignOut = async () => { await signOut(); };

  /* ── Owner view — unchanged ── */
  if (ownerMode) {
    return (
      <div className="space-y-8">
        <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-brand-light flex items-center justify-center text-brand-text-strong text-xl font-bold shrink-0">
              {getInitials(currentUser)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-primary">{currentUser || 'Owner'}</h1>
              <span className="inline-flex items-center gap-1.5 mt-1 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                <Shield size={12} /> Owner
              </span>
            </div>
          </div>
        </div>
        <SettingsContent />
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors cursor-pointer"
        >
          <LogOut size={18} /> Sign Out
        </button>
      </div>
    );
  }

  /* ── Team member data ── */

  const userEmail = user?.email?.toLowerCase();
  const myPlaybooks = permissions[userEmail]?.playbooks || [];
  const mySuggestions = suggestions.filter((s) => s.submittedBy === currentUser);
  const myIdeas = mySuggestions.filter((s) => s.type === 'idea' || s.type === 'feedback');

  // Onboarding progress
  const getStepStatus = (stepId) => {
    const entry = suggestions.find(
      (s) => s.type === 'onboarding' && s.stepId === stepId &&
        (s.submittedByEmail === userEmail || s.submittedBy?.toLowerCase() === currentUser?.toLowerCase())
    );
    return entry ? entry.status : null;
  };

  const getActionProgress = (stepId) => {
    const team = myPlaybooks[0] || 'service';
    const saved = trainingConfig?.onboardingSteps?.[team]?.[stepId]?.actionItems;
    const items = saved || getDefaultActionItems(stepId);
    const completions = trainingConfig?.actionCompletions?.[userEmail]?.[stepId] || {};
    const done = items.filter((i) => completions[i.id]?.completed).length;
    return { total: items.length, done };
  };

  const onboardingDone = isOnboardingComplete(suggestions, currentUser, userEmail);

  // Ideas kanban grouping
  const submitted = myIdeas.filter((s) => s.status === 'New');
  const inReview = myIdeas.filter((s) => s.status === 'Reviewing');
  const actioned = myIdeas.filter((s) => s.status === 'Approved' || s.status === 'Implemented');
  const rejected = myIdeas.filter((s) => s.status === 'Rejected');

  const totalSubmitted = myIdeas.length;
  const totalActioned = actioned.length;

  const handleSubmit = (e) => {
    e.preventDefault();
    const today = new Date().toLocaleDateString('en-US');
    setSuggestions([
      {
        id: genId(),
        type: form.type,
        title: form.title.trim(),
        description: form.description.trim(),
        submittedBy: currentUser,
        date: today,
        status: 'New',
      },
      ...suggestions,
    ]);
    setForm({ type: 'idea', title: '', description: '' });
    setAdding(false);
  };

  /* ── Team member view ── */

  return (
    <div className="space-y-6">
      {/* ── Profile Header ── */}
      <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-brand-light flex items-center justify-center text-brand-text-strong text-xl font-bold shrink-0">
            {getInitials(currentUser)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">{currentUser || 'Team Member'}</h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                <User size={12} /> Team Member
              </span>
              {myPlaybooks.map((key) => {
                const opt = PLAYBOOK_OPTIONS.find((o) => o.key === key);
                return opt ? (
                  <span key={key} className={`px-2.5 py-1 rounded-full text-xs font-medium ${opt.color}`}>
                    {opt.label}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── My Progress ── */}
      <section>
        <h2 className="text-sm font-bold text-secondary uppercase tracking-wider mb-3">My Progress</h2>

        {/* Onboarding Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {ONBOARDING_STEPS.map((step) => {
            const StepIcon = STEP_ICONS[step.id] || ClipboardCheck;
            const status = getStepStatus(step.id);
            const { total, done } = getActionProgress(step.id);

            return (
              <button
                key={step.id}
                onClick={() => navigate(`/training/onboard/${step.id}`)}
                className="bg-card rounded-2xl shadow-sm border border-border-subtle p-4 text-left cursor-pointer hover:shadow-md hover:border-border-strong transition-all"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-xl ${step.bg} flex items-center justify-center shrink-0`}>
                    <StepIcon size={14} className={step.color} />
                  </div>
                  <span className="text-xs font-semibold text-primary truncate flex-1">{step.title}</span>
                  {status === 'Approved' && (
                    <Check size={14} className="text-emerald-500 shrink-0" />
                  )}
                </div>
                {total > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-surface-alt rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all"
                        style={{ width: `${(done / total) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted">{done}/{total}</span>
                  </div>
                )}
                <span className={`text-[10px] font-semibold mt-1.5 block ${
                  status === 'Approved' ? 'text-emerald-600' : done > 0 || status ? 'text-amber-600' : 'text-muted'
                }`}>
                  {status === 'Approved' ? 'Finished' : done > 0 || status ? 'In progress' : 'Not started'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Training Status */}
        <button
          onClick={() => navigate('/training')}
          className="w-full bg-card rounded-2xl shadow-sm border border-border-subtle p-4 flex items-center gap-3 cursor-pointer hover:shadow-md hover:border-border-strong transition-all"
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${onboardingDone ? 'bg-teal-100 dark:bg-teal-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
            {onboardingDone
              ? <GraduationCap size={18} className="text-teal-600" />
              : <Lock size={18} className="text-gray-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary">
              {onboardingDone ? 'Training Modules' : 'Training Locked'}
            </p>
            <p className="text-xs text-tertiary">
              {onboardingDone
                ? `${MODULE_LIST.length} modules available — keep learning`
                : 'Complete all onboarding steps to unlock training'}
            </p>
          </div>
          <ArrowRight size={16} className="text-muted shrink-0" />
        </button>
      </section>

      {/* ── Your Ideas & Feedback ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-secondary uppercase tracking-wider">Your Voice Matters</h2>
            <p className="text-xs text-tertiary mt-0.5">
              {totalSubmitted === 0
                ? 'Share ideas to improve the business — every suggestion is reviewed.'
                : `${totalSubmitted} submitted${totalActioned > 0 ? ` · ${totalActioned} actioned` : ''}`}
            </p>
          </div>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-white font-medium text-sm hover:bg-amber-600 transition-colors cursor-pointer"
            >
              <Plus size={16} /> Share
            </button>
          )}
        </div>

        {/* Submit Form */}
        {adding && (
          <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-primary text-sm">New Submission</h3>
              <button
                onClick={() => { setAdding(false); setForm({ type: 'idea', title: '', description: '' }); }}
                className="p-1 rounded-lg text-muted hover:text-secondary hover:bg-surface cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, type: 'idea' })}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    form.type === 'idea' ? 'bg-amber-500 text-white' : 'bg-surface-alt text-secondary hover:bg-surface-strong'
                  }`}
                >
                  <Lightbulb size={14} /> Business Idea
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, type: 'feedback' })}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    form.type === 'feedback' ? 'bg-blue-500 text-white' : 'bg-surface-alt text-secondary hover:bg-surface-strong'
                  }`}
                >
                  <MessageSquare size={14} /> App Feedback
                </button>
              </div>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition"
                placeholder={form.type === 'idea' ? "What's your idea?" : 'What could be better?'}
              />
              <textarea
                required
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition resize-y"
                placeholder={form.type === 'idea' ? 'Describe your idea and how it helps the business...' : "Describe what you'd like to see improved..."}
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setAdding(false); setForm({ type: 'idea', title: '', description: '' }); }}
                  className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors cursor-pointer"
                >
                  Submit
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Kanban Board */}
        {myIdeas.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KanbanColumn title="Submitted" count={submitted.length} color="bg-purple-500" items={submitted} />
            <KanbanColumn title="Under Review" count={inReview.length} color="bg-amber-500" items={inReview} />
            <KanbanColumn title="Actioned" count={actioned.length} color="bg-emerald-500" items={actioned} highlight />
          </div>
        ) : !adding ? (
          <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-8 text-center">
            <Lightbulb size={32} className="text-amber-400 mx-auto mb-2" />
            <p className="text-sm text-secondary font-medium">Got an idea to make things better?</p>
            <p className="text-xs text-tertiary mt-1">Every suggestion is reviewed by the team owner.</p>
          </div>
        ) : null}

        {/* Rejected — soft messaging */}
        {rejected.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
              Not Moving Forward ({rejected.length})
            </p>
            <div className="space-y-2">
              {rejected.map((item) => (
                <div key={item.id} className="bg-card rounded-xl border border-border-subtle p-3 opacity-60">
                  <div className="flex items-center gap-2">
                    {item.type === 'idea'
                      ? <Lightbulb size={12} className="text-amber-400" />
                      : <MessageSquare size={12} className="text-blue-400" />}
                    <span className="text-xs font-medium text-secondary truncate">{item.title}</span>
                    <span className="text-[10px] text-muted ml-auto shrink-0">{item.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Settings (Preferences only for team members) ── */}
      <SettingsContent />

      {/* ── Sign Out ── */}
      <button
        onClick={handleSignOut}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors cursor-pointer"
      >
        <LogOut size={18} /> Sign Out
      </button>
    </div>
  );
}
