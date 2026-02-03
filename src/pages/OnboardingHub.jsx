import { useEffect } from 'react';
import { Rocket, ChevronRight, ClipboardCheck, LogIn, LogOut, Shield, BookOpen, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { ONBOARDING_STEPS, isStepApproved } from './Training';

const STEP_ICONS = {
  'onboard-1': ClipboardCheck,
  'onboard-2': LogIn,
  'onboard-3': Shield,
  'onboard-4': BookOpen,
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

export default function OnboardingHub() {
  const navigate = useNavigate();
  const { user, currentUser, signOut } = useAuth();
  const userEmail = user?.email?.toLowerCase();

  const suggestions = useAppStore((s) => s.suggestions);
  const setSuggestions = useAppStore((s) => s.setSuggestions);
  const trainingConfig = useAppStore((s) => s.trainingConfig);
  const permissions = useAppStore((s) => s.permissions);

  const myPlaybooks = permissions[userEmail]?.playbooks || [];
  const primaryTeam = myPlaybooks[0] || 'service';

  const getStepEntry = (stepId) => {
    return suggestions.find(
      (s) => s.type === 'onboarding' && s.stepId === stepId &&
        (s.submittedByEmail === userEmail || s.submittedBy?.trim().toLowerCase() === currentUser?.trim().toLowerCase())
    ) || null;
  };

  const getActionProgress = (stepId) => {
    const saved = trainingConfig?.onboardingSteps?.[primaryTeam]?.[stepId]?.actionItems;
    const items = saved || getDefaultActionItems(stepId);
    const completions = trainingConfig?.actionCompletions?.[userEmail]?.[stepId] || {};
    const done = items.filter((i) => completions[i.id]?.completed).length;
    return { total: items.length, done };
  };

  // Progressive disclosure: show only onboard-1 until hired, then show remaining steps
  const step1Approved = isStepApproved(suggestions, currentUser, userEmail, 'onboard-1');
  const gateSteps = step1Approved
    ? ONBOARDING_STEPS.filter((s) => s.id !== 'onboard-1')
    : ONBOARDING_STEPS.filter((s) => s.id === 'onboard-1');

  // Check step 1 state
  const step1Entry = getStepEntry('onboard-1');
  const step1Progress = getActionProgress('onboard-1');

  // Auto-clean stale suggestion entries: if completions were wiped (owner reset)
  // but the suggestion survived due to name mismatch, remove the orphaned entry.
  useEffect(() => {
    if (
      step1Entry &&
      step1Entry.status !== 'Approved' &&
      step1Progress.done === 0 &&
      step1Progress.total > 0
    ) {
      // Stale entry — completions were reset but suggestion wasn't deleted
      setSuggestions(suggestions.filter((s) => s.id !== step1Entry.id));
    }
  }, [step1Entry?.id, step1Entry?.status, step1Progress.done]);

  // Re-compute after potential cleanup
  const step1Status = getStepEntry('onboard-1')?.status || null;
  const allDone = step1Progress.total > 0 && step1Progress.done === step1Progress.total;
  const showConfirmation = !step1Approved && (allDone || (step1Status && step1Status !== 'Approved'));

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-light mb-4">
          <Rocket size={32} className="text-brand-text" />
        </div>
        <h1 className="text-2xl font-bold text-primary">
          Welcome, {currentUser || 'Team Member'}!
        </h1>
        <p className="text-secondary text-sm mt-2 max-w-md mx-auto">
          {step1Approved
            ? 'Welcome to the team! Complete these remaining onboarding steps.'
            : 'Complete these onboarding steps to get started. Your tabs will unlock once the owner approves your onboarding.'}
        </p>
      </div>

      {/* Step Cards */}
      <div className="space-y-3">
        {gateSteps.map((step) => {
          const StepIcon = STEP_ICONS[step.id] || ClipboardCheck;
          const stepApproved = isStepApproved(suggestions, currentUser, userEmail, step.id);
          const entry = getStepEntry(step.id);
          const status = entry?.status || null;
          const { total, done } = getActionProgress(step.id);
          // Don't treat a stale entry (0 completions, not Approved) as submitted
          const isStale = status && status !== 'Approved' && done === 0 && total > 0;
          const effectiveStatus = isStale ? null : status;

          const allComplete = total > 0 && done === total;

          const statusLabel =
            stepApproved ? 'Approved' :
            effectiveStatus || allComplete ? 'Finished' :
            done > 0 ? 'In progress' :
            'Not started';

          const statusColor =
            stepApproved ? 'text-emerald-600' :
            effectiveStatus || allComplete ? 'text-emerald-600' :
            done > 0 ? 'text-amber-600' :
            'text-muted';

          return (
            <button
              key={step.id}
              onClick={() => navigate(`/training/onboard/${step.id}`)}
              className="w-full flex items-center gap-4 p-5 bg-card rounded-2xl shadow-sm border border-border-subtle hover:border-border-strong hover:shadow-md transition-all text-left cursor-pointer group"
            >
              <div className={`w-12 h-12 rounded-xl ${step.bg} ${step.borderColor} border flex items-center justify-center shrink-0 relative`}>
                <StepIcon size={22} className={step.color} />
                {stepApproved && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                    <CheckCircle size={14} className="text-white" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-primary block">{step.title}</span>
                {!stepApproved && total > 0 && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 h-1.5 bg-surface-alt rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all"
                        style={{ width: `${(done / total) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted shrink-0">{done}/{total}</span>
                  </div>
                )}
                <span className={`text-[10px] font-semibold mt-1 block ${statusColor}`}>
                  {statusLabel}
                </span>
              </div>
              <ChevronRight size={18} className="text-muted shrink-0 group-hover:text-secondary transition-colors" />
            </button>
          );
        })}
      </div>

      {/* Confirmation card */}
      {showConfirmation && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 text-center">
          <h3 className="font-semibold text-primary mb-1">Great, {currentUser}!</h3>
          <p className="text-sm text-secondary">
            We'll see you on test day!
          </p>
        </div>
      )}

      {/* Sign Out */}
      <button
        onClick={() => signOut()}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border-subtle text-secondary text-sm font-medium hover:bg-surface-alt transition-colors cursor-pointer"
      >
        <LogOut size={16} />
        Sign Out
      </button>
    </div>
  );
}
