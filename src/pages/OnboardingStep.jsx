import { useState, lazy, Suspense } from 'react';
import {
  ArrowLeft, Pencil, Plus, Trash2,
  ArrowUp, ArrowDown, X, Check, Send,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { ONBOARDING_STEPS, RichContent } from './Training';
import { genId } from '../data';

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
      { id: 'ob2-about', title: 'What This Step Is About', content: '<p><strong>Your practical evaluation day with a lead or owner.</strong> This is your chance to show what you can do and learn on the job.</p>' },
      { id: 'ob2-eval', title: "What You'll Be Evaluated On", content: '<ul><li>Safety awareness and PPE compliance</li><li>Equipment handling and care</li><li>Following playbook steps correctly</li><li>Attitude, communication, and teamwork</li><li>Willingness to ask questions and take feedback</li></ul>' },
      { id: 'ob2-tips', title: 'Tips for Success', content: '<ul><li>Ask questions \u2014 it shows initiative</li><li>Be on time and ready to work</li><li>Wear appropriate gear (closed-toe shoes, work clothes)</li><li>Stay positive and be coachable</li><li>Take notes if it helps you remember</li></ul>' },
      { id: 'ob2-after', title: 'After the Evaluation', content: '<ul><li>Your lead will submit a private evaluation</li><li>You submit your own progress update below</li><li>Owner reviews both and decides next steps</li></ul>' },
    ],
    'onboard-3': [
      { id: 'ob3-about', title: 'What This Step Is About', content: '<p><strong>Get fully set up in all company systems.</strong> This is the final admin step before you can start training modules.</p>' },
      { id: 'ob3-accounts', title: 'Account Setup', content: '<ul><li>Jobber login \u2014 for scheduling, clock-in/out, job tracking</li><li>ADP / payroll enrollment \u2014 direct deposit, tax forms</li><li>App access \u2014 this app for playbooks, training, HR</li></ul>' },
      { id: 'ob3-gear', title: 'Gear & Uniform', content: '<ul><li>Company shirts \u2014 get from your lead or owner</li><li>PPE \u2014 safety glasses, ear protection, gloves</li><li>Assigned equipment \u2014 any tools specific to your role</li></ul>' },
      { id: 'ob3-actions', title: 'Actions', content: '<ol><li>Confirm all accounts are working (Jobber, ADP, app)</li><li>Collect your gear and uniform</li><li>Submit "Ready to start training" below</li></ol>' },
      { id: 'ob3-next', title: "What's Next", content: '<p>Once the owner approves this step, <strong>training modules unlock automatically</strong>. You\'ll work through them in order with your mentor.</p>' },
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

  // Current user's submission status for this step
  const existingSubmission = suggestions.find(
    (s) => s.type === 'onboarding' && s.stepId === stepId && s.submittedBy === currentUser
  );

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
        date: today,
        status: 'New',
        internalNote: '',
      },
      ...suggestions,
    ]);
    showToast('Step submitted! Owner will review.');
  };

  /* ── Prev / Next ── */
  const currentIdx = ONBOARDING_STEPS.findIndex((s) => s.id === stepId);
  const prevStep = currentIdx > 0 ? ONBOARDING_STEPS[currentIdx - 1] : null;
  const nextStep = currentIdx < ONBOARDING_STEPS.length - 1 ? ONBOARDING_STEPS[currentIdx + 1] : null;

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
            onClick={() => navigate('/training')}
            className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors cursor-pointer mb-6"
          >
            <ArrowLeft size={16} />
            Back to Training
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

        {/* ── Mark Complete (team member only) ── */}
        {!ownerMode && (
          <div className="mt-8">
            {existingSubmission ? (
              <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5 text-center">
                <p className="text-sm text-secondary">
                  You submitted this step on <span className="font-semibold">{existingSubmission.date}</span>.
                </p>
                <span className={`inline-block mt-2 text-xs font-semibold px-3 py-1.5 rounded-full ${
                  existingSubmission.status === 'Approved'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  Status: {existingSubmission.status}
                </span>
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
              onClick={() => navigate('/training')}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
            >
              Back to Training
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
    </div>
  );
}
