import { useState, lazy, Suspense } from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Pencil, Plus, Trash2,
  ArrowUp, ArrowDown, X, Check,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { MODULE_LIST, RichContent } from './Training';
import { genId } from '../data';

const RichTextEditor = lazy(() => import('../components/RichTextEditor'));

const TEAM_TABS = [
  { key: 'service', label: 'Field Team' },
  { key: 'sales', label: 'Sales Team' },
  { key: 'strategy', label: 'General Manager' },
];

const MODULE_GRADIENTS = {
  1: 'from-emerald-500 to-teal-600',
  2: 'from-red-500 to-rose-600',
  3: 'from-blue-500 to-indigo-600',
  4: 'from-purple-500 to-violet-600',
  5: 'from-amber-500 to-orange-600',
};

/* ── Default sections per module (used when nothing custom is saved) ── */

function generateDefaultSections(moduleId, playbookLabels) {
  const data = {
    1: [
      { id: 'd1-goal', title: 'Goal', content: '<p><strong>Set expectations, get set up, build company culture.</strong></p>' },
      { id: 'd1-learn', title: "What You'll Learn", content: '<ul><li>Welcome from Jude: Our story, values (client respect, quality first)</li><li>Role overview: Daily duties as field member/lead</li><li>HR essentials: Pay schedule, time off, code of conduct</li><li>Uniform/shirts: Get from mentor/owner, why important (professionalism/safety)</li><li>Logistics: Schedule, meeting points, communication (app announcements)</li></ul>' },
      { id: 'd1-actions', title: 'Actions', content: '<ol><li>Read HR policies.</li><li>Get shirts/uniform.</li><li>Acknowledge understanding.</li><li>Submit progress: \u201COnboarded \u2013 questions?\u201D</li></ol>' },
      { id: 'd1-links', title: 'Quick Links', content: '<p><a href="/hr">View HR Policies</a> \u00B7 <a href="/hr">Request Time Off</a></p>' },
    ],
    2: [
      { id: 'd2-goal', title: 'Goal', content: '<p><strong>Prioritize zero accidents with PPE and safe practices.</strong></p>' },
      { id: 'd2-learn', title: "What You'll Learn", content: '<ul><li>PPE requirements: Hard hat, safety glasses, ear protection, steel-toe boots \u2013 storage/care</li><li>Hazard recognition: Weather, chemicals, slips, equipment risks</li><li>Safe practices: Fueling (engine off, no smoking), startup sequences</li><li>Emergency protocols: Report injuries/near-misses</li><li>Equipment basics: Pre-checks, maintenance</li></ul>' },
      { id: 'd2-actions', title: 'Actions', content: '<ol><li>Review safety reminders.</li><li>Demo PPE/equipment with mentor (photo in submit).</li><li>Complete safety checklist in Home.</li><li>Submit progress: \u201CSafety understood \u2013 practiced startup.\u201D</li></ol>' },
      { id: 'd2-links', title: 'Quick Links', content: '<p><a href="/equipment">Report Hazard / Issue</a> \u00B7 <a href="/equipment">View Equipment Log</a></p>' },
    ],
    3: [
      { id: 'd3-goal', title: 'Goal', content: '<p><strong>Master Jobber, this app, payroll for efficient ops.</strong></p>' },
      { id: 'd3-learn', title: "What You'll Learn", content: '<ul><li>App mastery: Home checklists, Playbooks search, HR time off, Ideas submits</li><li>Jobber how-to: Login, clock in/out, schedules, post-job photos/checklists</li><li>Payroll/ADP: Setup, timesheets, pay stubs</li><li>Other tools: QuickBooks basics (if applicable), equipment reporting</li><li>Troubleshooting: Offline mode, common issues</li></ul>' },
      { id: 'd3-actions', title: 'Actions', content: '<ol><li>Log into Jobber/ADP with mentor.</li><li>Practice app features (test Idea submit).</li><li>Complete a Jobber job cycle (simulated ok).</li><li>Submit progress: \u201CTools set up \u2013 practiced clock in.\u201D</li></ol>' },
      { id: 'd3-links', title: 'Quick Links', content: '<p><a href="http://heyjudeslawncare.com/app" target="_blank" rel="noopener noreferrer">Open Jobber</a> \u00B7 <a href="/profile">Submit Test Idea</a></p>' },
    ],
    4: [
      { id: 'd4-goal', title: 'Goal', content: '<p><strong>Know what \u201Cdone right\u201D looks like for services.</strong></p>' },
      { id: 'd4-learn', title: "What You'll Learn", content: `<ul><li>Quality overview: Success criteria (clean edges, no debris)</li><li>Playbooks deep dive: Read all assigned (${playbookLabels}), steps/order</li><li>Adaptation: Site tweaks (client notes, weather)</li></ul>` },
      { id: 'd4-actions', title: 'Actions', content: '<ol><li>Read all Playbooks.</li><li>Note what success looks like.</li><li>Shadow mentor on job.</li><li>Submit progress: \u201CPlaybooks reviewed \u2013 questions on [specific].\u201D</li></ol>' },
      { id: 'd4-links', title: 'Quick Links', content: '<p><a href="/guides">View Playbooks</a></p>' },
    ],
    5: [
      { id: 'd5-goal', title: 'Goal', content: '<p><strong>Polish skills through practice.</strong></p>' },
      { id: 'd5-learn', title: "What You'll Learn", content: '<ul><li>Practice jobs: Follow playbooks, adapt to variables</li><li>Mentor feedback: Refine techniques</li><li>Continuous improvement: Suggest Ideas, refreshers</li></ul>' },
      { id: 'd5-actions', title: 'Actions', content: '<ol><li>Complete supervised jobs.</li><li>Get input after each.</li><li>Submit final update: \u201CReady for independent work.\u201D</li></ol>' },
      { id: 'd5-links', title: 'Quick Links', content: '<p><a href="/profile">Submit Idea</a></p>' },
    ],
  };
  return data[moduleId] || [];
}

/* ── Component ── */

export default function TrainingModule() {
  const navigate = useNavigate();
  const { moduleId } = useParams();
  const id = Number(moduleId);

  const { user, ownerMode } = useAuth();
  const userEmail = user?.email?.toLowerCase();

  const permissions = useAppStore((s) => s.permissions);
  const trainingConfig = useAppStore((s) => s.trainingConfig);
  const setTrainingConfig = useAppStore((s) => s.setTrainingConfig);

  const allowedPlaybooks = ownerMode
    ? ['service', 'sales', 'strategy']
    : (permissions[userEmail]?.playbooks || ['service']);
  const playbookLabels = allowedPlaybooks
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
    .join(', ');

  const primaryTeam = allowedPlaybooks[0] || 'service';

  // Owner team selector
  const [selectedTeam, setSelectedTeam] = useState(primaryTeam);
  const activeTeam = ownerMode ? selectedTeam : primaryTeam;

  // Section editor state
  const [editingSection, setEditingSection] = useState(null); // section id or 'new'
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  // Module title editor state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const showModule5 = !!trainingConfig?.showModule5;
  const visibleModules = MODULE_LIST.filter((m) => !m.optional || showModule5);

  const mod = MODULE_LIST.find((m) => m.id === id);
  if (!mod || (mod.optional && !showModule5)) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">Module not found.</p>
        <button onClick={() => navigate('/training')} className="mt-4 text-sm text-blue-600 underline cursor-pointer">
          Back to Training
        </button>
      </div>
    );
  }

  const Icon = mod.icon;
  const gradient = MODULE_GRADIENTS[id] || MODULE_GRADIENTS[1];

  // Module data for active team
  const moduleData = trainingConfig?.teamModules?.[activeTeam]?.[id];
  const customTitle = moduleData?.title || null;

  // Sections: saved sections → legacy single-blob → generated defaults
  const savedSections = moduleData?.sections || null;
  const legacySections = (!savedSections && moduleData?.content)
    ? [{ id: 'legacy-content', title: 'Content', content: moduleData.content }]
    : null;
  const defaultSections = generateDefaultSections(id, playbookLabels);
  const sections = savedSections || legacySections || defaultSections;
  const isUsingDefaults = !savedSections && !legacySections;

  // Prev / Next
  const currentIdx = visibleModules.findIndex((m) => m.id === id);
  const prevMod = currentIdx > 0 ? visibleModules[currentIdx - 1] : null;
  const nextMod = currentIdx < visibleModules.length - 1 ? visibleModules[currentIdx + 1] : null;

  /* ── Persistence helpers ── */

  const saveModuleData = (updates) => {
    const cfg = JSON.parse(JSON.stringify(trainingConfig || {}));
    if (!cfg.teamModules) cfg.teamModules = {};
    if (!cfg.teamModules[activeTeam]) cfg.teamModules[activeTeam] = {};
    cfg.teamModules[activeTeam][id] = {
      ...(cfg.teamModules[activeTeam][id] || {}),
      ...updates,
    };
    // Migrate: drop old single-blob when saving sections
    if (updates.sections) delete cfg.teamModules[activeTeam][id].content;
    setTrainingConfig(cfg);
  };

  const saveSections = (next) => saveModuleData({ sections: next });

  // Always copy to a mutable array before mutating
  const baseSections = () =>
    (isUsingDefaults ? defaultSections : sections).map((s) => ({ ...s }));

  /* ── Section CRUD ── */

  const openEditSection = (section) => {
    setEditTitle(section.title);
    setEditContent(section.content);
    setEditingSection(section.id);
  };

  const openAddSection = () => {
    setEditTitle('');
    setEditContent('');
    setEditingSection('new');
  };

  const handleSaveSection = () => {
    const arr = baseSections();
    if (editingSection === 'new') {
      arr.push({ id: genId(), title: editTitle.trim() || 'New Section', content: editContent });
    } else {
      const idx = arr.findIndex((s) => s.id === editingSection);
      if (idx >= 0) arr[idx] = { ...arr[idx], title: editTitle.trim() || arr[idx].title, content: editContent };
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

  /* ── Module title editing ── */

  const handleSaveTitle = () => {
    const t = titleDraft.trim();
    if (t && t !== mod.title) {
      saveModuleData({ title: t });
    } else {
      const cfg = JSON.parse(JSON.stringify(trainingConfig || {}));
      if (cfg.teamModules?.[activeTeam]?.[id]) {
        delete cfg.teamModules[activeTeam][id].title;
        setTrainingConfig(cfg);
      }
    }
    setEditingTitle(false);
  };

  /* ── Team switch (close any open editor) ── */

  const handleTeamChange = (key) => {
    setSelectedTeam(key);
    setEditingSection(null);
    setEditingTitle(false);
  };

  /* ─── Render ─── */

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-8">
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
                Module {id} of {visibleModules.length}
              </p>

              {editingTitle ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    className="text-xl sm:text-2xl font-bold bg-white/20 text-white rounded-lg px-3 py-1 outline-none placeholder-white/50 flex-1 min-w-0"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') setEditingTitle(false);
                    }}
                  />
                  <button onClick={handleSaveTitle} className="p-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors cursor-pointer"><Check size={18} /></button>
                  <button onClick={() => setEditingTitle(false)} className="p-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors cursor-pointer"><X size={18} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-bold text-white truncate">
                    {customTitle || mod.title}
                  </h1>
                  {ownerMode && (
                    <button
                      onClick={() => { setTitleDraft(customTitle || mod.title); setEditingTitle(true); }}
                      className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/20 transition-colors cursor-pointer shrink-0"
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                </div>
              )}
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
              {/* Section header */}
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-bold text-primary">{section.title}</h2>

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

              {/* Section body */}
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

        {/* Prev / Next */}
        <div className="flex items-center justify-between gap-4 mt-8">
          {prevMod ? (
            <button
              onClick={() => navigate(`/training/${prevMod.id}`)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
              <span className="hidden sm:inline">{prevMod.title}</span>
              <span className="sm:hidden">Previous</span>
            </button>
          ) : <div />}
          {nextMod ? (
            <button
              onClick={() => navigate(`/training/${nextMod.id}`)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r ${MODULE_GRADIENTS[nextMod.id] || gradient} text-white text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer`}
            >
              <span className="hidden sm:inline">{nextMod.title}</span>
              <span className="sm:hidden">Next Module</span>
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={() => navigate('/training')}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
            >
              Back to All Modules
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ── Section Editor Modal ── */}
      {editingSection !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingSection(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
              <h3 className="text-lg font-bold text-primary">
                {editingSection === 'new' ? 'Add Section' : 'Edit Section'}
              </h3>
              <button onClick={() => setEditingSection(null)} className="p-1.5 rounded-lg text-muted hover:text-secondary hover:bg-surface transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-secondary mb-1">Section Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-brand focus:border-brand outline-none transition"
                  placeholder="e.g. Goal, What You'll Learn, Actions..."
                  autoFocus
                />
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

            {/* Footer */}
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
