import { useState } from 'react';
import {
  GraduationCap, BookOpen, ChevronRight, Send,
  Briefcase, Monitor, Shield, Star, Check,
  ClipboardCheck, UserCheck, FileCheck, Lock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { genId } from '../data';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';

/* ─── Onboarding steps (prerequisite before training modules) ─── */

export const ONBOARDING_STEPS = [
  { id: 'onboard-1', title: 'Step 1: Pre-Test Day Prep', icon: ClipboardCheck, color: 'text-orange-500', bg: 'bg-orange-50', borderColor: 'border-orange-200', gradient: 'from-orange-500 to-amber-600' },
  { id: 'onboard-2', title: 'Step 2: Test Day Evaluation', icon: UserCheck, color: 'text-cyan-500', bg: 'bg-cyan-50', borderColor: 'border-cyan-200', gradient: 'from-cyan-500 to-teal-600' },
  { id: 'onboard-3', title: 'Step 3: Post-Test Admin Setup', icon: FileCheck, color: 'text-violet-500', bg: 'bg-violet-50', borderColor: 'border-violet-200', gradient: 'from-violet-500 to-purple-600' },
];

/**
 * Check whether the current user has completed onboarding.
 * Requires an approved Step 3 submission in the suggestions array.
 */
export function isOnboardingComplete(suggestions, currentUser) {
  return suggestions.some(
    (s) =>
      s.type === 'onboarding' &&
      s.stepId === 'onboard-3' &&
      s.submittedBy === currentUser &&
      s.status === 'Approved'
  );
}

/* ─── Module metadata (exported for Settings editor) ─── */

export const MODULE_LIST = [
  { id: 1, title: 'Module 1: Onboarding & Company Basics', icon: Briefcase, color: 'text-emerald-500', bg: 'bg-emerald-50', borderColor: 'border-emerald-200' },
  { id: 2, title: 'Module 2: Safety & Equipment Handling', icon: Shield, color: 'text-red-500', bg: 'bg-red-50', borderColor: 'border-red-200' },
  { id: 3, title: 'Module 3: Technical Tools & Software', icon: Monitor, color: 'text-blue-500', bg: 'bg-blue-50', borderColor: 'border-blue-200' },
  { id: 4, title: 'Module 4: Quality Standards & Playbooks', icon: BookOpen, color: 'text-purple-500', bg: 'bg-purple-50', borderColor: 'border-purple-200' },
  { id: 5, title: 'Module 5: Refinement & Adaptation (Ongoing)', icon: Star, color: 'text-amber-500', bg: 'bg-amber-50', borderColor: 'border-amber-200', optional: true },
];

/* ─── Rich HTML content renderer with internal link interception ─── */

export function RichContent({ html, navigate }) {
  const handleClick = (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href');
    if (href && href.startsWith('/')) {
      e.preventDefault();
      navigate(href);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="prose prose-sm max-w-none text-secondary [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_a]:text-blue-600 [&_a]:underline [&_a]:font-medium [&_a]:cursor-pointer [&_strong]:text-primary [&_h3]:text-primary [&_h3]:text-sm [&_h3]:font-bold"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/* ─── Main component — module list page ─── */

export default function Training() {
  const navigate = useNavigate();
  const { user, currentUser, ownerMode } = useAuth();
  const userEmail = user?.email?.toLowerCase();

  const permissions = useAppStore((s) => s.permissions);
  const suggestions = useAppStore((s) => s.suggestions);
  const setSuggestions = useAppStore((s) => s.setSuggestions);
  const trainingConfig = useAppStore((s) => s.trainingConfig);

  const [showProgressForm, setShowProgressForm] = useState(false);
  const [progressNote, setProgressNote] = useState('');
  const [toast, setToast] = useState(null);

  const allowedPlaybooks = ownerMode
    ? ['service', 'sales', 'strategy']
    : (permissions[userEmail]?.playbooks || ['service']);

  const showModule5 = !!trainingConfig?.showModule5;
  const visibleModules = MODULE_LIST.filter((m) => !m.optional || showModule5);

  // Custom titles from team-specific content
  const primaryTeam = allowedPlaybooks[0] || 'service';
  const teamModules = trainingConfig?.teamModules?.[primaryTeam] || {};
  const legacyModules = trainingConfig?.modules || {};
  const getCustomTitle = (id) => teamModules[id]?.title || legacyModules[id]?.title || null;

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  };

  const openProgressForm = () => {
    setProgressNote(
      `Module(s) completed: \nWhat I learned / practiced: \nQuestions or need help with: \nProof / photos attached: [optional]`
    );
    setShowProgressForm(true);
  };

  const handleSubmitProgress = (e) => {
    e.preventDefault();
    if (!progressNote.trim()) return;
    const today = new Date().toLocaleDateString('en-US');
    setSuggestions([
      {
        id: genId(),
        type: 'training',
        title: `${currentUser} – Training Progress Update`,
        description: progressNote.trim(),
        submittedBy: currentUser,
        date: today,
        status: 'New',
      },
      ...suggestions,
    ]);
    setProgressNote('');
    setShowProgressForm(false);
    showToast('Update submitted! Owner will review.');
  };

  const onboardingDone = isOnboardingComplete(suggestions, currentUser);
  const modulesLocked = !ownerMode && !onboardingDone;

  // Per-step status for the current user
  const getStepStatus = (stepId) => {
    const entry = suggestions.find(
      (s) => s.type === 'onboarding' && s.stepId === stepId && s.submittedBy === currentUser
    );
    if (!entry) return null;
    return entry.status;
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium shadow-lg flex items-center gap-2 max-w-sm text-center">
          <Check size={16} className="shrink-0" />
          {toast}
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <GraduationCap size={24} className="text-brand-text" />
          <h1 className="text-2xl font-bold text-primary">Your Training Path</h1>
        </div>
        <p className="text-secondary text-sm">
          Complete the onboarding steps first, then work through the training modules with your mentor.
        </p>
      </div>

      {/* ── Onboarding Section ── */}
      <div>
        <h2 className="text-sm font-bold text-secondary uppercase tracking-wider mb-3">Onboarding</h2>
        <div className="space-y-3">
          {ONBOARDING_STEPS.map((step) => {
            const Icon = step.icon;
            const status = getStepStatus(step.id);
            const statusBadge = status === 'Approved'
              ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">Approved</span>
              : status
                ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">{status}</span>
                : null;
            return (
              <button
                key={step.id}
                onClick={() => navigate(`/training/onboard/${step.id}`)}
                className="w-full flex items-center gap-4 p-5 bg-card rounded-2xl shadow-sm border border-border-subtle hover:border-border-strong hover:shadow-md transition-all text-left cursor-pointer group"
              >
                <div className={`w-11 h-11 rounded-xl ${step.bg} ${step.borderColor} border flex items-center justify-center shrink-0`}>
                  <Icon size={20} className={step.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-primary block">{step.title}</span>
                </div>
                {statusBadge && <div className="shrink-0">{statusBadge}</div>}
                <ChevronRight size={18} className="text-muted shrink-0 group-hover:text-secondary transition-colors" />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Training Modules Section ── */}
      <div>
        <h2 className="text-sm font-bold text-secondary uppercase tracking-wider mb-3">Training Modules</h2>
        <div className="space-y-3">
          {visibleModules.map((mod) => {
            const Icon = mod.icon;
            const customTitle = getCustomTitle(mod.id);

            if (modulesLocked) {
              return (
                <div
                  key={mod.id}
                  onClick={() => showToast('Complete onboarding to unlock training modules')}
                  className="w-full flex items-center gap-4 p-5 bg-card rounded-2xl shadow-sm border border-border-subtle opacity-50 cursor-pointer"
                >
                  <div className={`w-11 h-11 rounded-xl bg-surface-alt border border-border-default flex items-center justify-center shrink-0`}>
                    <Lock size={20} className="text-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-muted block">{customTitle || mod.title}</span>
                    {mod.optional && (
                      <span className="text-xs text-muted">Optional</span>
                    )}
                  </div>
                  <Lock size={16} className="text-muted shrink-0" />
                </div>
              );
            }

            return (
              <button
                key={mod.id}
                onClick={() => navigate(`/training/${mod.id}`)}
                className="w-full flex items-center gap-4 p-5 bg-card rounded-2xl shadow-sm border border-border-subtle hover:border-border-strong hover:shadow-md transition-all text-left cursor-pointer group"
              >
                <div className={`w-11 h-11 rounded-xl ${mod.bg} ${mod.borderColor} border flex items-center justify-center shrink-0`}>
                  <Icon size={20} className={mod.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-primary block">{customTitle || mod.title}</span>
                  {mod.optional && (
                    <span className="text-xs text-muted">Optional</span>
                  )}
                </div>
                <ChevronRight size={18} className="text-muted shrink-0 group-hover:text-secondary transition-colors" />
              </button>
            );
          })}
        </div>

        {modulesLocked && (
          <p className="text-xs text-muted mt-2 text-center">
            Complete onboarding Step 3 and get owner approval to unlock training modules.
          </p>
        )}
      </div>

      {/* Submit Progress Update (team member only, when unlocked) */}
      {!ownerMode && !modulesLocked && (
        <div>
          {!showProgressForm ? (
            <button
              onClick={openProgressForm}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Send size={16} />
              Submit Progress Update
            </button>
          ) : (
            <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-6">
              <h3 className="font-bold text-primary mb-1">Training Progress Update</h3>
              <p className="text-xs text-tertiary mb-3">Fill in the template below. Your update will be sent to the owner for review.</p>
              <form onSubmit={handleSubmitProgress} className="space-y-3">
                <textarea
                  rows={6}
                  value={progressNote}
                  onChange={(e) => setProgressNote(e.target.value)}
                  className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-sm text-primary focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition resize-y font-mono"
                  required
                />
                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => { setShowProgressForm(false); setProgressNote(''); }}
                    className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors cursor-pointer"
                  >
                    Submit Update
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
