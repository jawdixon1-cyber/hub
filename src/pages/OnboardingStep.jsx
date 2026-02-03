import { useState, lazy, Suspense } from 'react';
import {
  ArrowLeft, Pencil, Plus, Trash2,
  ArrowUp, ArrowDown, X, Check, Send,
  ClipboardList, Shield, CheckSquare, ExternalLink, FileSignature,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { ONBOARDING_STEPS, RichContent, isOnboardingComplete } from './Training';
import { genId } from '../data';
import SignaturePad from '../components/SignaturePad';

const RichTextEditor = lazy(() => import('../components/RichTextEditor'));

const TEAM_TABS = [
  { key: 'service', label: 'Field Team' },
  { key: 'sales', label: 'Sales Team' },
  { key: 'strategy', label: 'General Manager' },
];

const TITLE_SIZE_OPTIONS = [
  { key: 'sm', label: 'S', class: 'text-sm' },
  { key: 'base', label: 'M', class: 'text-base' },
  { key: 'lg', label: 'L', class: 'text-lg' },
  { key: 'xl', label: 'XL', class: 'text-xl' },
  { key: '2xl', label: '2XL', class: 'text-2xl' },
  { key: '3xl', label: '3XL', class: 'text-3xl' },
  { key: '4xl', label: '4XL', class: 'text-4xl' },
];

const titleSizeClass = (key) =>
  (TITLE_SIZE_OPTIONS.find((o) => o.key === key) || TITLE_SIZE_OPTIONS[2]).class;

/* ── Default sections per onboarding step ── */

function generateDefaultSections(stepId) {
  const data = {
    'onboard-1': [
      { id: 'ob1-about', title: 'What This Step Is About', content: '<p><strong>Prepare before your first day in the field.</strong> This step makes sure you have everything you need to hit the ground running on test day.</p>' },
      { id: 'ob1-before', title: 'Before You Arrive', content: '<ul><li>Review company values and mission</li><li>Read through HR policies (time off, code of conduct, pay schedule)</li><li>Gather any required documents (ID, direct deposit info)</li><li>Confirm your schedule and meeting point with your lead</li></ul>' },
      { id: 'ob1-expect', title: 'What to Expect on Test Day', content: '<ul><li>You\'ll shadow an experienced crew member</li><li>Demonstrate basic skills and willingness to learn</li><li>Receive real-time feedback from your lead</li><li>Get familiar with the job site flow</li></ul>' },
      { id: 'ob1-actions', title: 'Actions', content: '<ol><li>Read all HR policies in the HR tab</li><li>Review safety basics (PPE, hazard awareness)</li><li>Confirm your test day schedule with your lead</li><li>Mark this step complete when ready</li></ol>' },
    ],
    'onboard-2': [
      { id: 'ob2-about', title: 'What This Step Is About', content: '<p><strong>Get logged into every system you\'ll use on the job.</strong> Your lead will walk you through each one so you know what it does and how to use it.</p>' },
      { id: 'ob2-adp', title: 'ADP (Payroll & HR)', content: '<ul><li>ADP handles your pay, direct deposit, tax forms, and time tracking</li><li>Log in with the credentials provided by your lead</li><li>Verify your personal info and direct deposit details are correct</li><li>Learn how to view your pay stubs and schedule</li></ul>' },
      { id: 'ob2-dro', title: 'DRO', content: '<ul><li>DRO is used for daily route operations and job management</li><li>Log in and familiarize yourself with the interface</li><li>Your lead will walk you through how jobs, routes, and tasks are organized</li><li>Learn how to check your assignments and update job status</li></ul>' },
      { id: 'ob2-overview', title: 'How Everything Connects', content: '<p>Each system has a specific role:</p><ul><li><strong>ADP</strong> \u2014 payroll, time tracking, HR documents</li><li><strong>DRO</strong> \u2014 daily routes, job assignments, task updates</li><li><strong>This app</strong> \u2014 playbooks, training, HR policies, checklists</li></ul><p>If you have trouble logging in or something doesn\'t make sense, ask your lead \u2014 that\'s what this step is for.</p>' },
      { id: 'ob2-next', title: "What's Next", content: '<p>Once the owner approves this step, <strong>training modules unlock automatically</strong>. You\'ll work through them in order with your mentor.</p>' },
    ],
    'onboard-3': [
      { id: 'ob3-about', title: 'What This Step Is About', content: '<p><strong>Review and sign key company policies.</strong> These policies cover expectations, scheduling, conduct, and other important guidelines you\'ll need to follow as a team member.</p>' },
      { id: 'ob3-policies', title: 'Policies Overview', content: '<p>All company policies are accessible on the <a href="/hr">HR page</a>. During this step, you\'ll read through and formally accept the policies listed below. Each one requires your signature to confirm you\'ve read and understood it.</p>' },
    ],
    'onboard-4': [
      { id: 'ob4-about', title: 'What This Step Is About', content: '<p><strong>Review your team\'s playbook(s) and confirm your understanding.</strong> Playbooks outline the procedures, expectations, and guidelines for how your team operates day-to-day.</p>' },
      { id: 'ob4-where', title: 'Where to Find Playbooks', content: '<p>Your team\'s playbooks are available on the <a href="/guides">Playbooks page</a>. Take your time reading through each one carefully. If anything is unclear, ask your lead or mentor for clarification.</p>' },
      { id: 'ob4-next', title: "What's Next", content: '<p>Once the owner approves this step, <strong>training modules unlock automatically</strong>. You\'ll work through them in order with your mentor.</p>' },
    ],
  };
  return data[stepId] || [];
}

/* ── Default action items per onboarding step ── */

function generateDefaultActionItems(stepId) {
  const data = {
    'onboard-1': [
      { id: 'ai1-hr', type: 'policy', label: 'Read and accept HR Policies', link: '/hr', policyText: 'I acknowledge that I have read and understand the HR Policies of Hey Jude\'s Lawn Care, including policies on time off, code of conduct, and pay schedule. I agree to comply with all company policies as a condition of my employment.' },
      { id: 'ai1-safety', type: 'policy', label: 'Read and accept Safety Guidelines', policyText: 'I acknowledge that I have read and understand the Safety Guidelines of Hey Jude\'s Lawn Care. I agree to follow all safety protocols, wear required PPE, and report any hazards or unsafe conditions immediately.' },
      { id: 'ai1-app-cert', type: 'policy', label: 'Application Certification & Background Check Authorization', policyText: 'I certify that the information provided in this application is true and complete to the best of my knowledge. I understand that false or misleading information may disqualify me from employment or result in dismissal if discovered later.\n\nI authorize Hey Jude\'s Lawn Care to contact any references or employers listed above for the purpose of verifying employment and qualifications.\n\nHey Jude\'s Lawn Care may conduct a background check as part of the hiring process. By signing below, I authorize this screening for employment purposes.' },
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
      { id: 'ai3-timeoff', type: 'policy', label: 'Read and accept Time Off & Scheduling', policyId: '51' },
      { id: 'ai3-conduct', type: 'policy', label: 'Read and accept Code of Conduct', policyId: '53' },
      { id: 'ai3-newhire', type: 'policy', label: 'Read and accept New Hire Onboarding', policyId: '52' },
    ],
    'onboard-4': [
      { id: 'ai4-playbook', type: 'policy', label: 'I have reviewed and understand my assigned team playbook(s)', policyText: 'I confirm that I have reviewed the playbook(s) assigned to my team. I understand the procedures, expectations, and guidelines outlined in the playbook(s) and agree to follow them in my daily work.' },
    ],
  };
  return data[stepId] || [];
}

/* ── Component ── */

export default function OnboardingStep() {
  const navigate = useNavigate();
  const { stepId } = useParams();

  const { user, currentUser, ownerMode } = useAuth();
  const userEmail = user?.email?.toLowerCase();

  const permissions = useAppStore((s) => s.permissions);
  const suggestions = useAppStore((s) => s.suggestions);
  const setSuggestions = useAppStore((s) => s.setSuggestions);
  const trainingConfig = useAppStore((s) => s.trainingConfig);
  const setTrainingConfig = useAppStore((s) => s.setTrainingConfig);
  const policies = useAppStore((s) => s.policies) || [];

  const allowedPlaybooks = ownerMode
    ? ['service', 'sales', 'strategy']
    : (permissions[userEmail]?.playbooks || ['service']);
  const primaryTeam = allowedPlaybooks[0] || 'service';

  const [selectedTeam, setSelectedTeam] = useState(primaryTeam);
  const activeTeam = ownerMode ? selectedTeam : primaryTeam;

  // Section editor state
  const [editingSection, setEditingSection] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTitleSize, setEditTitleSize] = useState('lg');
  const [editContent, setEditContent] = useState('');

  // Action items state
  const [editingActions, setEditingActions] = useState(false);
  const [actionDraft, setActionDraft] = useState([]);
  const [acceptingPolicy, setAcceptingPolicy] = useState(null); // action item being signed
  const [viewingPolicy, setViewingPolicy] = useState(null); // accepted policy being viewed

  const [toast, setToast] = useState(null);

  const step = ONBOARDING_STEPS.find((s) => s.id === stepId);
  if (!step) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">Onboarding step not found.</p>
        <button onClick={() => navigate('/training')} className="mt-4 text-sm text-blue-600 underline cursor-pointer">
          Back to Training
        </button>
      </div>
    );
  }

  const Icon = step.icon;
  const gradient = step.gradient;
  const stepNum = ONBOARDING_STEPS.findIndex((s) => s.id === stepId) + 1;

  // Sections: saved custom → defaults
  const savedSections = trainingConfig?.onboardingSteps?.[activeTeam]?.[stepId]?.sections || null;
  const defaultSections = generateDefaultSections(stepId);
  const sections = savedSections || defaultSections;
  const isUsingDefaults = !savedSections;

  // Action items: saved custom → defaults
  const savedActionItems = trainingConfig?.onboardingSteps?.[activeTeam]?.[stepId]?.actionItems || null;
  const actionItems = savedActionItems || generateDefaultActionItems(stepId);

  // Action completions for current user
  const completions = trainingConfig?.actionCompletions?.[userEmail]?.[stepId] || {};
  const completedCount = actionItems.filter((item) => completions[item.id]?.completed).length;

  // Current user's submission status for this step
  const existingSubmission = suggestions.find(
    (s) => s.type === 'onboarding' && s.stepId === stepId &&
      (s.submittedByEmail === userEmail || s.submittedBy?.toLowerCase() === currentUser?.toLowerCase())
  );

  // Navigate back to onboarding hub or training depending on state
  const backPath = isOnboardingComplete(suggestions, currentUser, userEmail) || ownerMode ? '/training' : '/';
  const backLabel = isOnboardingComplete(suggestions, currentUser, userEmail) || ownerMode ? 'Back to Training' : 'Back to Onboarding';

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  };

  /* ── Persistence helpers ── */

  const saveStepData = (updates) => {
    const cfg = JSON.parse(JSON.stringify(trainingConfig || {}));
    if (!cfg.onboardingSteps) cfg.onboardingSteps = {};
    if (!cfg.onboardingSteps[activeTeam]) cfg.onboardingSteps[activeTeam] = {};
    cfg.onboardingSteps[activeTeam][stepId] = {
      ...(cfg.onboardingSteps[activeTeam][stepId] || {}),
      ...updates,
    };
    setTrainingConfig(cfg);
  };

  const saveSections = (next) => saveStepData({ sections: next });

  const saveActionItems = (items) => saveStepData({ actionItems: items });

  const saveCompletion = (itemId, data) => {
    const cfg = JSON.parse(JSON.stringify(trainingConfig || {}));
    if (!cfg.actionCompletions) cfg.actionCompletions = {};
    if (!cfg.actionCompletions[userEmail]) cfg.actionCompletions[userEmail] = {};
    if (!cfg.actionCompletions[userEmail][stepId]) cfg.actionCompletions[userEmail][stepId] = {};
    cfg.actionCompletions[userEmail][stepId][itemId] = data;
    setTrainingConfig(cfg);
  };

  const toggleChecklist = (itemId) => {
    const current = completions[itemId];
    if (current?.completed) {
      // Un-complete
      saveCompletion(itemId, { completed: false });
    } else {
      saveCompletion(itemId, {
        completed: true,
        date: new Date().toLocaleDateString('en-US'),
      });
    }
  };

  const baseSections = () =>
    (isUsingDefaults ? defaultSections : sections).map((s) => ({ ...s }));

  /* ── Section CRUD ── */

  const openEditSection = (section) => {
    setEditTitle(section.title);
    setEditTitleSize(section.titleSize || 'lg');
    setEditContent(section.content);
    setEditingSection(section.id);
  };

  const openAddSection = () => {
    setEditTitle('');
    setEditTitleSize('lg');
    setEditContent('');
    setEditingSection('new');
  };

  const handleSaveSection = () => {
    const arr = baseSections();
    if (editingSection === 'new') {
      arr.push({ id: genId(), title: editTitle.trim() || 'New Section', titleSize: editTitleSize, content: editContent });
    } else {
      const idx = arr.findIndex((s) => s.id === editingSection);
      if (idx >= 0) arr[idx] = { ...arr[idx], title: editTitle.trim() || arr[idx].title, titleSize: editTitleSize, content: editContent };
    }
    saveSections(arr);
    setEditingSection(null);
  };

  const handleDeleteSection = (sectionId) => {
    if (!confirm('Delete this section?')) return;
    saveSections(baseSections().filter((s) => s.id !== sectionId));
  };

  const handleMove = (sectionId, dir) => {
    const arr = baseSections();
    const i = arr.findIndex((s) => s.id === sectionId);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    saveSections(arr);
  };

  const handleTeamChange = (key) => {
    setSelectedTeam(key);
    setEditingSection(null);
    setEditingActions(false);
  };

  /* ── Action Item Editor helpers (owner) ── */

  const openActionEditor = () => {
    setActionDraft(actionItems.map((item) => ({ ...item })));
    setEditingActions(true);
  };

  const addDraftItem = (type) => {
    setActionDraft([...actionDraft, { id: genId(), type, label: '', ...(type === 'policy' ? { policyId: '', policyText: '' } : {}) }]);
  };

  const updateDraftItem = (id, field, value) => {
    setActionDraft(actionDraft.map((item) =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const removeDraftItem = (id) => {
    setActionDraft(actionDraft.filter((item) => item.id !== id));
  };

  const moveDraftItem = (id, dir) => {
    const arr = [...actionDraft];
    const i = arr.findIndex((item) => item.id === id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setActionDraft(arr);
  };

  const handleSaveActions = () => {
    const cleaned = actionDraft
      .filter((item) => item.label.trim())
      .map((item) => {
        const out = { id: item.id, type: item.type, label: item.label.trim() };
        if (item.type === 'policy') {
          if (item.policyId) out.policyId = item.policyId;
          if (item.link?.trim()) out.link = item.link.trim();
          if (item.policyText?.trim()) out.policyText = item.policyText.trim();
        }
        return out;
      });
    saveActionItems(cleaned);
    setEditingActions(false);
    showToast('Action items saved');
  };

  /* ── Policy acceptance (team member) ── */

  const handlePolicySign = (dataUrl) => {
    if (!acceptingPolicy) return;
    saveCompletion(acceptingPolicy.id, {
      completed: true,
      date: new Date().toLocaleDateString('en-US'),
      signature: dataUrl,
    });
    showToast('Policy accepted and signed');
    setAcceptingPolicy(null);
  };

  /* ── Mark Complete ── */

  const handleMarkComplete = () => {
    const today = new Date().toLocaleDateString('en-US');
    setSuggestions([
      {
        id: genId(),
        type: 'onboarding',
        stepId,
        title: `${currentUser} \u2013 ${step.title} Complete`,
        description: `${currentUser} has completed ${step.title}.`,
        submittedBy: currentUser,
        submittedByEmail: userEmail,
        date: today,
        status: 'New',
        internalNote: '',
      },
      ...suggestions,
    ]);
    showToast('Step submitted! Owner will review.');
  };

  /* ── Prev / Next ── */
  const inOnboardingGate = !isOnboardingComplete(suggestions, currentUser, userEmail) && !ownerMode;
  const currentIdx = ONBOARDING_STEPS.findIndex((s) => s.id === stepId);
  const prevStep = currentIdx > 0 ? ONBOARDING_STEPS[currentIdx - 1] : null;
  const nextStep = currentIdx < ONBOARDING_STEPS.length - 1 && !inOnboardingGate
    ? ONBOARDING_STEPS[currentIdx + 1]
    : null;

  /* ─── Render ─── */

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-8">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium shadow-lg flex items-center gap-2 max-w-sm text-center">
          <Check size={16} className="shrink-0" />
          {toast}
        </div>
      )}

      {/* ── Hero banner ── */}
      <div className={`bg-gradient-to-r ${gradient} px-4 sm:px-6 lg:px-8 pt-6 pb-12`}>
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => navigate(backPath)}
            className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors cursor-pointer mb-6"
          >
            <ArrowLeft size={16} />
            {backLabel}
          </button>

          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <Icon size={28} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white/70 text-sm font-medium mb-1">
                Onboarding Step {stepNum} of {ONBOARDING_STEPS.length}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-white truncate">
                {step.title}
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 pb-8">

        {/* Owner team tabs */}
        {ownerMode && (
          <div className="flex items-center gap-1 bg-card p-1 rounded-xl w-fit mb-5 shadow-sm border border-border-subtle">
            {TEAM_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => handleTeamChange(t.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  activeTeam === t.key
                    ? 'bg-surface-alt text-primary shadow-sm'
                    : 'text-tertiary hover:text-secondary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Sections */}
        <div className="space-y-5">
          {sections.map((section, idx) => (
            <div
              key={section.id}
              className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 group relative"
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className={`${titleSizeClass(section.titleSize)} font-bold text-primary`}>{section.title}</h2>

                {ownerMode && (
                  <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    {idx > 0 && (
                      <button onClick={() => handleMove(section.id, 'up')} className="p-1.5 rounded-lg text-muted hover:text-secondary hover:bg-surface transition-colors cursor-pointer" title="Move up">
                        <ArrowUp size={14} />
                      </button>
                    )}
                    {idx < sections.length - 1 && (
                      <button onClick={() => handleMove(section.id, 'down')} className="p-1.5 rounded-lg text-muted hover:text-secondary hover:bg-surface transition-colors cursor-pointer" title="Move down">
                        <ArrowDown size={14} />
                      </button>
                    )}
                    <button onClick={() => openEditSection(section)} className="p-1.5 rounded-lg text-muted hover:text-brand-text hover:bg-brand-light transition-colors cursor-pointer" title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDeleteSection(section.id)} className="p-1.5 rounded-lg text-muted hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              <RichContent html={section.content} navigate={navigate} />
            </div>
          ))}

          {/* Add section (owner) */}
          {ownerMode && (
            <button
              onClick={openAddSection}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-border-strong text-muted hover:text-secondary hover:border-brand transition-colors cursor-pointer"
            >
              <Plus size={18} />
              Add Section
            </button>
          )}
        </div>

        {/* ── Action Steps Section ── */}
        {actionItems.length > 0 && (
          <div className="mt-8 bg-card rounded-2xl shadow-sm border border-border-subtle p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <ClipboardList size={20} className="text-brand-text" />
                <h2 className="text-lg font-bold text-primary">Action Steps</h2>
              </div>
              {ownerMode ? (
                <button
                  onClick={openActionEditor}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-text bg-brand-light hover:bg-brand-light/80 transition-colors cursor-pointer"
                >
                  <Pencil size={12} />
                  Edit Action Items
                </button>
              ) : (
                <span className="text-xs font-semibold text-secondary">
                  {completedCount}/{actionItems.length} completed
                </span>
              )}
            </div>

            {/* Progress bar */}
            {!ownerMode && actionItems.length > 0 && (
              <div className="mb-4">
                <div className="w-full h-2 bg-surface-alt rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-300"
                    style={{ width: `${actionItems.length > 0 ? (completedCount / actionItems.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              {actionItems.map((item) => {
                const done = completions[item.id]?.completed;

                /* ── Owner view: static preview with type badges ── */
                if (ownerMode) {
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-alt"
                    >
                      {item.type === 'policy' ? (
                        <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          <Shield size={10} />
                          Policy
                        </span>
                      ) : (
                        <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          <CheckSquare size={10} />
                          Checklist
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-primary">{item.label}</span>
                        {item.policyText && (
                          <p className="text-[11px] text-tertiary mt-0.5 line-clamp-1">{item.policyText}</p>
                        )}
                      </div>
                      {item.link && (
                        <span className="text-xs text-muted shrink-0">{item.link}</span>
                      )}
                    </div>
                  );
                }

                /* ── Team view: interactive items ── */
                if (item.type === 'checklist') {
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleChecklist(item.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-alt transition-colors text-left cursor-pointer"
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        done
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'border-border-strong'
                      }`}>
                        {done && <Check size={12} className="text-white" />}
                      </div>
                      <span className={`text-sm flex-1 ${done ? 'line-through text-muted' : 'text-primary'}`}>
                        {item.label}
                      </span>
                      {done && completions[item.id]?.date && (
                        <span className="text-[10px] text-muted shrink-0">{completions[item.id].date}</span>
                      )}
                    </button>
                  );
                }

                /* Policy type */
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-alt transition-colors"
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      done
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-amber-400 bg-amber-50'
                    }`}>
                      {done ? (
                        <Check size={12} className="text-white" />
                      ) : (
                        <FileSignature size={10} className="text-amber-600" />
                      )}
                    </div>
                    <span className={`text-sm flex-1 ${done ? 'line-through text-muted' : 'text-primary'}`}>
                      {item.label}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {done ? (
                        <button
                          onClick={() => setViewingPolicy(item)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer"
                        >
                          <ExternalLink size={12} />
                          View
                        </button>
                      ) : (
                        <button
                          onClick={() => setAcceptingPolicy(item)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors cursor-pointer"
                        >
                          <FileSignature size={12} />
                          Read &amp; Accept
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Mark Complete (team member only) ── */}
        {!ownerMode && (
          <div className="mt-8">
            {existingSubmission ? (
              <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5 text-center">
                <p className="text-sm text-secondary">
                  {existingSubmission.status === 'Approved'
                    ? 'This step is complete.'
                    : `You submitted this step on ${existingSubmission.date}.`}
                </p>
                {existingSubmission.status === 'Approved' && (
                  <span className="inline-block mt-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700">
                    Complete
                  </span>
                )}
              </div>
            ) : (
              <button
                onClick={handleMarkComplete}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r ${gradient} text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer`}
              >
                <Send size={16} />
                Mark Complete
              </button>
            )}
          </div>
        )}

        {/* Prev / Next */}
        <div className="flex items-center justify-between gap-4 mt-8">
          {prevStep ? (
            <button
              onClick={() => navigate(`/training/onboard/${prevStep.id}`)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">{prevStep.title}</span>
              <span className="sm:hidden">Previous</span>
            </button>
          ) : <div />}
          {nextStep ? (
            <button
              onClick={() => navigate(`/training/onboard/${nextStep.id}`)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r ${nextStep.gradient} text-white text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer`}
            >
              <span className="hidden sm:inline">{nextStep.title}</span>
              <span className="sm:hidden">Next Step</span>
              <Check size={16} />
            </button>
          ) : (
            <button
              onClick={() => navigate(backPath)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
            >
              {backLabel}
              <Check size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ── Section Editor Modal ── */}
      {editingSection !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingSection(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
              <h3 className="text-lg font-bold text-primary">
                {editingSection === 'new' ? 'Add Section' : 'Edit Section'}
              </h3>
              <button onClick={() => setEditingSection(null)} className="p-1.5 rounded-lg text-muted hover:text-secondary hover:bg-surface transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-secondary mb-1">Section Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-brand focus:border-brand outline-none transition"
                  placeholder="e.g. What to Expect, Actions..."
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-secondary mb-1">Title Size</label>
                <div className="flex items-center gap-1">
                  {TITLE_SIZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setEditTitleSize(opt.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        editTitleSize === opt.key
                          ? 'bg-brand text-on-brand'
                          : 'bg-surface-alt text-secondary hover:bg-surface-strong'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-secondary mb-1">Content</label>
                <Suspense
                  fallback={
                    <div className="rounded-lg border border-border-strong p-8 flex items-center justify-center">
                      <div className="flex items-center gap-2 text-muted text-sm">
                        <div className="w-4 h-4 border-2 border-muted border-t-transparent rounded-full animate-spin" />
                        Loading editor...
                      </div>
                    </div>
                  }
                >
                  <RichTextEditor content={editContent} onChange={setEditContent} />
                </Suspense>
              </div>
            </div>

            <div className="flex gap-3 justify-end px-6 py-4 border-t border-border-subtle shrink-0">
              <button
                onClick={() => setEditingSection(null)}
                className="px-5 py-2.5 rounded-lg border border-border-strong text-secondary font-medium hover:bg-surface transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSection}
                className="px-5 py-2.5 rounded-lg bg-brand text-on-brand font-medium hover:bg-brand-hover transition-colors cursor-pointer"
              >
                {editingSection === 'new' ? 'Add Section' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Action Item Editor Modal (owner) ── */}
      {editingActions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingActions(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
              <h3 className="text-lg font-bold text-primary">Edit Action Items</h3>
              <button onClick={() => setEditingActions(false)} className="p-1.5 rounded-lg text-muted hover:text-secondary hover:bg-surface transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {actionDraft.length === 0 && (
                <p className="text-sm text-muted text-center py-4">No action items yet. Add one below.</p>
              )}
              {actionDraft.map((item, idx) => (
                <div key={item.id} className="flex items-start gap-2 p-3 rounded-lg bg-surface-alt border border-border-subtle">
                  <div className="flex flex-col gap-0.5 pt-2 shrink-0">
                    {idx > 0 && (
                      <button onClick={() => moveDraftItem(item.id, 'up')} className="p-0.5 text-muted hover:text-secondary cursor-pointer">
                        <ArrowUp size={12} />
                      </button>
                    )}
                    {idx < actionDraft.length - 1 && (
                      <button onClick={() => moveDraftItem(item.id, 'down')} className="p-0.5 text-muted hover:text-secondary cursor-pointer">
                        <ArrowDown size={12} />
                      </button>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        item.type === 'policy'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {item.type}
                      </span>
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => updateDraftItem(item.id, 'label', e.target.value)}
                        placeholder={item.type === 'policy' ? 'e.g. Read and accept HR Policies' : 'e.g. Confirm schedule with lead'}
                        className="flex-1 rounded-lg border border-border-strong px-3 py-1.5 text-sm text-primary focus:ring-2 focus:ring-brand focus:border-brand outline-none transition"
                      />
                    </div>
                    {item.type === 'policy' && (
                      <>
                        <div>
                          <label className="block text-[10px] font-semibold text-tertiary uppercase tracking-wider mb-1">Link to HR Policy</label>
                          <select
                            value={item.policyId || ''}
                            onChange={(e) => {
                              const pid = e.target.value;
                              const pol = policies.find((p) => p.id === pid);
                              setActionDraft(actionDraft.map((ai) =>
                                ai.id === item.id
                                  ? { ...ai, policyId: pid, ...(pol ? { label: pol.title } : {}) }
                                  : ai
                              ));
                            }}
                            className="w-full rounded-lg border border-border-strong px-3 py-1.5 text-sm text-primary focus:ring-2 focus:ring-brand focus:border-brand outline-none transition bg-card"
                          >
                            <option value="">None — custom text only</option>
                            {policies.map((p) => (
                              <option key={p.id} value={p.id}>{p.title}</option>
                            ))}
                          </select>
                          <p className="text-[10px] text-muted mt-1">Select a policy from the HR handbook, or leave blank and write custom text below.</p>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-tertiary uppercase tracking-wider mb-1">
                            {item.policyId ? 'Additional acknowledgment text (optional)' : 'Custom acknowledgment text'}
                          </label>
                          <textarea
                            value={item.policyText || ''}
                            onChange={(e) => updateDraftItem(item.id, 'policyText', e.target.value)}
                            placeholder={item.policyId
                              ? 'Add any extra text the team member should acknowledge alongside the policy...'
                              : 'Write what the team member must read and sign, e.g. "I understand the pay rate is $X/hr and I will follow all safety procedures..."'}
                            rows={3}
                            className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-brand focus:border-brand outline-none transition resize-y"
                          />
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => removeDraftItem(item.id)}
                    className="p-1.5 rounded-lg text-muted hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer shrink-0 mt-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {/* Add buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => addDraftItem('checklist')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-blue-300 text-blue-600 text-xs font-semibold hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  Checklist Item
                </button>
                <button
                  onClick={() => addDraftItem('policy')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-amber-300 text-amber-600 text-xs font-semibold hover:bg-amber-50 transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  Policy Item
                </button>
              </div>
            </div>

            <div className="flex gap-3 justify-end px-6 py-4 border-t border-border-subtle shrink-0">
              <button
                onClick={() => setEditingActions(false)}
                className="px-5 py-2.5 rounded-lg border border-border-strong text-secondary font-medium hover:bg-surface transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveActions}
                className="px-5 py-2.5 rounded-lg bg-brand text-on-brand font-medium hover:bg-brand-hover transition-colors cursor-pointer"
              >
                Save Action Items
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Policy Acceptance Modal (team member) ── */}
      {acceptingPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAcceptingPolicy(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
              <h3 className="text-lg font-bold text-primary">{acceptingPolicy.label}</h3>
              <button onClick={() => setAcceptingPolicy(null)} className="p-1.5 rounded-lg text-muted hover:text-secondary hover:bg-surface transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* HR Policy content from store */}
              {(() => {
                const linkedPolicy = acceptingPolicy.policyId
                  ? policies.find((p) => p.id === acceptingPolicy.policyId)
                  : null;
                return linkedPolicy ? (
                  <div className="bg-surface-alt rounded-lg border border-border-subtle p-4 max-h-60 overflow-y-auto">
                    <p className="text-[10px] font-bold text-tertiary uppercase tracking-wider mb-2">{linkedPolicy.title}</p>
                    <div className="text-sm text-primary leading-relaxed whitespace-pre-wrap">{linkedPolicy.content}</div>
                  </div>
                ) : null;
              })()}

              {/* Custom acknowledgment text */}
              {acceptingPolicy.policyText && (
                <div className="bg-surface-alt rounded-lg border border-border-subtle p-4 max-h-60 overflow-y-auto">
                  <p className="text-[10px] font-bold text-tertiary uppercase tracking-wider mb-2">Please read the following carefully</p>
                  {acceptingPolicy.policyText.split('\n\n').map((paragraph, i) => (
                    <p key={i} className="text-sm text-primary leading-relaxed mb-2 last:mb-0 whitespace-pre-wrap">
                      {paragraph}
                    </p>
                  ))}
                </div>
              )}

              {/* Fallback when no content */}
              {!acceptingPolicy.policyId && !acceptingPolicy.policyText && (
                <div className="bg-surface-alt rounded-lg p-4">
                  <p className="text-sm text-secondary">{acceptingPolicy.label}</p>
                </div>
              )}

              {/* Acknowledgment */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800 font-medium">
                  By signing below, I acknowledge that I have read and understood the above and agree to its terms.
                </p>
              </div>

              {/* Signature */}
              <div>
                <label className="block text-sm font-semibold text-secondary mb-2">Your Signature</label>
                <SignaturePad
                  onSave={handlePolicySign}
                  onCancel={() => setAcceptingPolicy(null)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── View Accepted Policy Modal ── */}
      {viewingPolicy && (() => {
        const completion = completions[viewingPolicy.id] || {};
        const linkedPolicy = viewingPolicy.policyId
          ? policies.find((p) => p.id === viewingPolicy.policyId)
          : null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewingPolicy(null)}>
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
                <h3 className="text-lg font-bold text-primary">{viewingPolicy.label}</h3>
                <button onClick={() => setViewingPolicy(null)} className="p-1.5 rounded-lg text-muted hover:text-secondary hover:bg-surface transition-colors cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* HR Policy content */}
                {linkedPolicy && (
                  <div className="bg-surface-alt rounded-lg border border-border-subtle p-4 max-h-60 overflow-y-auto">
                    <p className="text-[10px] font-bold text-tertiary uppercase tracking-wider mb-2">{linkedPolicy.title}</p>
                    <div className="text-sm text-primary leading-relaxed whitespace-pre-wrap">{linkedPolicy.content}</div>
                  </div>
                )}

                {/* Custom acknowledgment text */}
                {viewingPolicy.policyText && (
                  <div className="bg-surface-alt rounded-lg border border-border-subtle p-4 max-h-60 overflow-y-auto">
                    <p className="text-[10px] font-bold text-tertiary uppercase tracking-wider mb-2">Acknowledgment</p>
                    {viewingPolicy.policyText.split('\n\n').map((paragraph, i) => (
                      <p key={i} className="text-sm text-primary leading-relaxed mb-2 last:mb-0 whitespace-pre-wrap">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                )}

                {/* Fallback */}
                {!linkedPolicy && !viewingPolicy.policyText && (
                  <div className="bg-surface-alt rounded-lg p-4">
                    <p className="text-sm text-secondary">{viewingPolicy.label}</p>
                  </div>
                )}

                {/* Signature */}
                {completion.signature && (
                  <div>
                    <p className="text-[10px] font-bold text-tertiary uppercase tracking-wider mb-2">Your Signature</p>
                    <div className="bg-white rounded-lg border border-border-subtle p-3">
                      <img src={completion.signature} alt="Signature" className="max-h-32 mx-auto" />
                    </div>
                  </div>
                )}

                {/* Accepted date */}
                {completion.date && (
                  <p className="text-xs text-muted text-center">
                    Accepted on {completion.date}
                  </p>
                )}
              </div>

              <div className="flex justify-end px-6 py-4 border-t border-border-subtle shrink-0">
                <button
                  onClick={() => setViewingPolicy(null)}
                  className="px-5 py-2.5 rounded-lg bg-brand text-on-brand font-medium hover:bg-brand-hover transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
