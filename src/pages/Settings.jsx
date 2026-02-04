import { useState, useEffect, lazy, Suspense } from 'react';
import { ChevronRight, ChevronDown, Pencil, Sun, Moon, Clock, Globe, Settings as SettingsIcon, ClipboardList, GraduationCap, Users, X, Wrench, Plus, BookOpen, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ChecklistEditorModal = lazy(() => import('../components/ChecklistEditorModal'));
import { ONBOARDING_STEPS } from './Training';
import { EQUIPMENT_TYPES } from '../data';
import { useTheme } from '../contexts/ThemeContext';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';

const TIMEZONE_OPTIONS = [
  { value: '', label: 'Auto (device default)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
];

const TZ_STORAGE_KEY = 'greenteam-timezone';

export function SettingsContent() {
  const navigate = useNavigate();
  const { ownerMode } = useAuth();

  const { theme, themeMode, setThemeMode } = useTheme();
  const [timezone, setTimezone] = useState(() => localStorage.getItem(TZ_STORAGE_KEY) || '');
  const [showChecklistEditor, setShowChecklistEditor] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [showTraining, setShowTraining] = useState(false);

  const equipmentCategories = useAppStore((s) => s.equipmentCategories);
  const setEquipmentCategories = useAppStore((s) => s.setEquipmentCategories);
  const customModules = useAppStore((s) => s.customModules);
  const setCustomModules = useAppStore((s) => s.setCustomModules);

  const [showCategories, setShowCategories] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [showCreateModule, setShowCreateModule] = useState(false);
  const [newModuleName, setNewModuleName] = useState('');
  const [newModuleSection, setNewModuleSection] = useState('training');
  const [editingModule, setEditingModule] = useState(null);
  const [editModuleName, setEditModuleName] = useState('');
  const [editModuleSection, setEditModuleSection] = useState('');

  // One-time migration: seed equipmentCategories with built-in types if empty
  useEffect(() => {
    if (equipmentCategories.length === 0) {
      setEquipmentCategories([...EQUIPMENT_TYPES]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const teamChecklist = useAppStore((s) => s.teamChecklist);
  const setTeamChecklist = useAppStore((s) => s.setTeamChecklist);
  const teamEndChecklist = useAppStore((s) => s.teamEndChecklist);
  const setTeamEndChecklist = useAppStore((s) => s.setTeamEndChecklist);
  const ownerStartChecklist = useAppStore((s) => s.ownerStartChecklist);
  const setOwnerStartChecklist = useAppStore((s) => s.setOwnerStartChecklist);
  const ownerEndChecklist = useAppStore((s) => s.ownerEndChecklist);
  const setOwnerEndChecklist = useAppStore((s) => s.setOwnerEndChecklist);

  const handleTimezoneChange = (value) => {
    setTimezone(value);
    if (value) {
      localStorage.setItem(TZ_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(TZ_STORAGE_KEY);
    }
  };

  /* ── Module helpers ── */

  const LEARNING_SECTIONS = [
    { key: 'test-day', label: 'Test Day', desc: 'What new hires see and complete before their test day' },
    { key: 'onboarding', label: 'Onboarding', desc: 'Steps unlocked after hiring — logins, policies, and playbook review' },
    { key: 'training', label: 'Training', desc: 'Ongoing training modules for the team' },
  ];

  const builtInBySection = {
    'test-day': ONBOARDING_STEPS.filter((s) => s.id === 'onboard-1'),
    'onboarding': ONBOARDING_STEPS.filter((s) => s.id !== 'onboard-1'),
    'training': [],
  };

  const getModulesForSection = (sectionKey) =>
    (customModules || [])
      .filter((m) => m.section === sectionKey)
      .sort((a, b) => a.order - b.order);

  const handleCreateModule = () => {
    const trimmed = newModuleName.trim();
    if (!trimmed) return;
    const sectionModules = getModulesForSection(newModuleSection);
    const newModule = {
      id: `mod-${Date.now()}`,
      title: trimmed,
      section: newModuleSection,
      order: sectionModules.length,
    };
    setCustomModules((prev) => [...(prev || []), newModule]);
    setNewModuleName('');
    setNewModuleSection('training');
    setShowCreateModule(false);
  };

  const handleDeleteModule = (moduleId) => {
    setCustomModules((prev) => (prev || []).filter((m) => m.id !== moduleId));
  };

  const handleMoveModule = (moduleId, direction) => {
    setCustomModules((prev) => {
      const all = [...(prev || [])];
      const mod = all.find((m) => m.id === moduleId);
      if (!mod) return all;
      const sectionMods = all
        .filter((m) => m.section === mod.section)
        .sort((a, b) => a.order - b.order);
      const idx = sectionMods.findIndex((m) => m.id === moduleId);
      const swapIdx = idx + direction;
      if (swapIdx < 0 || swapIdx >= sectionMods.length) return all;
      const swapMod = sectionMods[swapIdx];
      const modOrder = mod.order;
      const swapOrder = swapMod.order;
      return all.map((m) => {
        if (m.id === moduleId) return { ...m, order: swapOrder };
        if (m.id === swapMod.id) return { ...m, order: modOrder };
        return m;
      });
    });
  };

  const startEditModule = (mod) => {
    setEditingModule(mod.id);
    setEditModuleName(mod.title);
    setEditModuleSection(mod.section);
  };

  const handleSaveEditModule = () => {
    const trimmed = editModuleName.trim();
    if (!trimmed) return;
    setCustomModules((prev) => {
      const all = prev || [];
      const mod = all.find((m) => m.id === editingModule);
      const sectionChanged = mod && mod.section !== editModuleSection;
      if (sectionChanged) {
        const newSectionMods = all.filter((m) => m.section === editModuleSection);
        return all.map((m) =>
          m.id === editingModule
            ? { ...m, title: trimmed, section: editModuleSection, order: newSectionMods.length }
            : m
        );
      }
      return all.map((m) =>
        m.id === editingModule ? { ...m, title: trimmed } : m
      );
    });
    setEditingModule(null);
  };

  return (
    <div className="space-y-8">
      {/* ── Preferences ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon size={22} className="text-brand-text" />
          <h2 className="text-2xl font-bold text-primary">Settings</h2>
        </div>

        <div className="bg-card rounded-2xl shadow-lg border border-border-subtle overflow-hidden">
          <button
            onClick={() => setShowPrefs(!showPrefs)}
            className="w-full flex items-center justify-between p-6 cursor-pointer hover:bg-surface-alt/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <SettingsIcon size={18} className="text-muted" />
              <div className="text-left">
                <p className="text-sm font-medium text-primary">Preferences</p>
                <p className="text-xs text-tertiary">Appearance and time zone</p>
              </div>
            </div>
            <ChevronDown size={16} className={`text-muted shrink-0 transition-transform duration-200 ${showPrefs ? 'rotate-180' : ''}`} />
          </button>

          {showPrefs && (
            <div className="px-6 pb-6 space-y-6 border-t border-border-subtle pt-4">
              {/* Theme */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {theme === 'dark' ? <Moon size={18} className="text-muted" /> : <Sun size={18} className="text-muted" />}
                  <div>
                    <p className="text-sm font-medium text-primary">Appearance</p>
                    <p className="text-xs text-tertiary">
                      {themeMode === 'auto'
                        ? `Auto — currently ${theme} until ${theme === 'dark' ? '7:00 AM' : '8:00 PM'}`
                        : theme === 'dark' ? 'Dark mode' : 'Light mode'}
                    </p>
                  </div>
                </div>
                <div className="flex rounded-lg border border-border-default overflow-hidden">
                  {[
                    { mode: 'light', icon: <Sun size={14} />, label: 'Light' },
                    { mode: 'dark', icon: <Moon size={14} />, label: 'Dark' },
                    { mode: 'auto', icon: <Clock size={14} />, label: 'Auto' },
                  ].map(({ mode, icon, label }) => (
                    <button
                      key={mode}
                      onClick={() => setThemeMode(mode)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                        themeMode === mode
                          ? 'bg-brand text-on-brand'
                          : 'bg-card text-secondary hover:bg-surface'
                      }`}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timezone */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Globe size={18} className="text-muted" />
                  <div>
                    <p className="text-sm font-medium text-primary">Time Zone</p>
                    <p className="text-xs text-tertiary">Used for dates and schedules</p>
                  </div>
                </div>
                <select
                  value={timezone}
                  onChange={(e) => handleTimezoneChange(e.target.value)}
                  className="rounded-lg border border-border-default bg-card px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition max-w-[220px]"
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Edit Checklists (owner only) ── */}
      {ownerMode && (
        <div>
          <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ClipboardList size={18} className="text-muted" />
                <div>
                  <p className="text-sm font-medium text-primary">Checklists</p>
                  <p className="text-xs text-tertiary">Edit team and owner daily checklists</p>
                </div>
              </div>
              <button
                onClick={() => setShowChecklistEditor(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand font-medium text-sm hover:bg-brand-hover transition-colors"
              >
                <Pencil size={14} />
                Edit Checklists
              </button>
            </div>
          </div>

          {showChecklistEditor && (
            <Suspense fallback={null}>
              <ChecklistEditorModal
                onClose={() => setShowChecklistEditor(false)}
                teamChecklist={teamChecklist}
                setTeamChecklist={setTeamChecklist}
                teamEndChecklist={teamEndChecklist}
                setTeamEndChecklist={setTeamEndChecklist}
                ownerStartChecklist={ownerStartChecklist}
                setOwnerStartChecklist={setOwnerStartChecklist}
                ownerEndChecklist={ownerEndChecklist}
                setOwnerEndChecklist={setOwnerEndChecklist}
              />
            </Suspense>
          )}
        </div>
      )}

      {/* ── Team Learning (owner only) ── */}
      {ownerMode && (
        <div>
          <div className="bg-card rounded-2xl shadow-lg border border-border-subtle overflow-hidden">
            <button
              onClick={() => setShowTraining(!showTraining)}
              className="w-full flex items-center justify-between p-6 cursor-pointer hover:bg-surface-alt/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <GraduationCap size={18} className="text-muted" />
                <div className="text-left">
                  <p className="text-sm font-medium text-primary">Team Learning</p>
                  <p className="text-xs text-tertiary">Edit content your team sees during test day, onboarding, and training</p>
                </div>
              </div>
              <ChevronDown size={16} className={`text-muted shrink-0 transition-transform duration-200 ${showTraining ? 'rotate-180' : ''}`} />
            </button>

            {showTraining && (
              <div className="px-6 pb-6 border-t border-border-subtle pt-4 space-y-5">
                {LEARNING_SECTIONS.map((section) => {
                  const builtIn = builtInBySection[section.key] || [];
                  const custom = getModulesForSection(section.key);

                  return (
                    <div key={section.key}>
                      <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">{section.label}</p>
                      <p className="text-[11px] text-tertiary mb-2">{section.desc}</p>
                      <div className="space-y-2">
                        {/* Built-in onboarding steps */}
                        {builtIn.map((step) => {
                          const StepIcon = step.icon;
                          return (
                            <button
                              key={step.id}
                              onClick={() => navigate(`/training/onboard/${step.id}`)}
                              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border-default hover:bg-surface transition-colors cursor-pointer text-left"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <StepIcon size={16} className={step.color} />
                                <span className="text-sm font-medium text-primary truncate">{step.title}</span>
                              </div>
                              <ChevronRight size={14} className="text-muted shrink-0" />
                            </button>
                          );
                        })}

                        {/* Custom modules */}
                        {custom.map((mod, idx) => (
                          <div key={mod.id} className="rounded-xl border border-border-default overflow-hidden">
                            {editingModule === mod.id ? (
                              <div className="p-4 space-y-3 bg-surface-alt/30">
                                <div>
                                  <label className="block text-xs font-medium text-secondary mb-1">Module Name</label>
                                  <input
                                    type="text"
                                    value={editModuleName}
                                    onChange={(e) => setEditModuleName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEditModule(); } }}
                                    className="w-full rounded-lg border border-border-default px-3 py-2.5 text-sm text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
                                    autoFocus
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-secondary mb-1">Section</label>
                                  <select
                                    value={editModuleSection}
                                    onChange={(e) => setEditModuleSection(e.target.value)}
                                    className="w-full rounded-lg border border-border-default px-3 py-2.5 text-sm text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
                                  >
                                    <option value="test-day">Test Day</option>
                                    <option value="onboarding">Onboarding</option>
                                    <option value="training">Training</option>
                                  </select>
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <button
                                    type="button"
                                    onClick={() => setEditingModule(null)}
                                    className="px-4 py-2 rounded-lg border border-border-default text-sm font-medium text-secondary hover:bg-surface transition-colors cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSaveEditModule}
                                    disabled={!editModuleName.trim()}
                                    className="px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-medium hover:bg-brand-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center">
                                <div
                                  onClick={() => navigate(`/training/module/${mod.id}`)}
                                  className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors cursor-pointer min-w-0"
                                >
                                  <BookOpen size={16} className="text-brand-text shrink-0" />
                                  <span className="text-sm font-medium text-primary truncate">{mod.title}</span>
                                </div>
                                <div className="flex items-center shrink-0 pr-2">
                                  <button
                                    type="button"
                                    onClick={() => handleMoveModule(mod.id, -1)}
                                    disabled={idx === 0}
                                    className="p-2.5 rounded-lg text-muted hover:text-primary hover:bg-surface-alt disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                  >
                                    <ArrowUp size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveModule(mod.id, 1)}
                                    disabled={idx === custom.length - 1}
                                    className="p-2.5 rounded-lg text-muted hover:text-primary hover:bg-surface-alt disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                  >
                                    <ArrowDown size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => startEditModule(mod)}
                                    className="p-2.5 rounded-lg text-muted hover:text-brand-text hover:bg-brand-light cursor-pointer transition-colors"
                                  >
                                    <Pencil size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteModule(mod.id)}
                                    className="p-2.5 rounded-lg text-muted hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 cursor-pointer transition-colors"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Empty state for sections with no items */}
                        {builtIn.length === 0 && custom.length === 0 && (
                          <div className="rounded-xl border border-dashed border-border-default py-4 text-center">
                            <p className="text-xs text-muted">No modules yet</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Create Module button */}
                <div className="pt-2 border-t border-border-subtle">
                  {showCreateModule ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-primary">New Module</p>
                      <div>
                        <label className="block text-xs font-medium text-secondary mb-1">Module Name</label>
                        <input
                          type="text"
                          value={newModuleName}
                          onChange={(e) => setNewModuleName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateModule(); } }}
                          placeholder="e.g. Mowing Best Practices"
                          className="w-full rounded-lg border border-border-default px-3 py-2.5 text-sm text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-secondary mb-1">Section</label>
                        <select
                          value={newModuleSection}
                          onChange={(e) => setNewModuleSection(e.target.value)}
                          className="w-full rounded-lg border border-border-default px-3 py-2.5 text-sm text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
                        >
                          <option value="test-day">Test Day</option>
                          <option value="onboarding">Onboarding</option>
                          <option value="training">Training</option>
                        </select>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => { setShowCreateModule(false); setNewModuleName(''); setNewModuleSection('training'); }}
                          className="px-4 py-2 rounded-lg border border-border-default text-sm font-medium text-secondary hover:bg-surface transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleCreateModule}
                          disabled={!newModuleName.trim()}
                          className="px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-medium hover:bg-brand-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Create
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowCreateModule(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-brand text-on-brand text-sm font-medium hover:bg-brand-hover transition-colors cursor-pointer"
                    >
                      <Plus size={15} />
                      Create Module
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Equipment Categories (owner only) ── */}
      {ownerMode && (
        <div>
          <div className="bg-card rounded-2xl shadow-lg border border-border-subtle overflow-hidden">
            <button
              onClick={() => setShowCategories(!showCategories)}
              className="w-full flex items-center justify-between p-6 cursor-pointer hover:bg-surface-alt/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Wrench size={18} className="text-muted" />
                <div className="text-left">
                  <p className="text-sm font-medium text-primary">Equipment Categories</p>
                  <p className="text-xs text-tertiary">Add custom equipment types</p>
                </div>
              </div>
              <ChevronDown size={16} className={`text-muted shrink-0 transition-transform duration-200 ${showCategories ? 'rotate-180' : ''}`} />
            </button>

            {showCategories && (
              <div className="px-6 pb-6 border-t border-border-subtle pt-4 space-y-4">
                {equipmentCategories.length === 0 ? (
                  <p className="text-xs text-muted">No equipment types yet. Add one below.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {equipmentCategories.map((cat) => (
                      <span
                        key={cat.value}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-surface-alt text-secondary border border-border-subtle"
                      >
                        {cat.label}
                        <button
                          onClick={() => setEquipmentCategories(equipmentCategories.filter((c) => c.value !== cat.value))}
                          className="ml-0.5 p-0.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Add new type */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCategoryLabel}
                    onChange={(e) => setNewCategoryLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const label = newCategoryLabel.trim();
                        if (!label) return;
                        const value = label.toLowerCase().replace(/\s+/g, '-');
                        if (equipmentCategories.some((c) => c.value === value)) return;
                        setEquipmentCategories([...equipmentCategories, { value, label }]);
                        setNewCategoryLabel('');
                      }
                    }}
                    placeholder="e.g. Trailer, Edger, Sprayer"
                    className="flex-1 rounded-lg border border-border-default bg-card px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
                  />
                  <button
                    onClick={() => {
                      const label = newCategoryLabel.trim();
                      if (!label) return;
                      const value = label.toLowerCase().replace(/\s+/g, '-');
                      if (equipmentCategories.some((c) => c.value === value)) return;
                      setEquipmentCategories([...equipmentCategories, { value, label }]);
                      setNewCategoryLabel('');
                    }}
                    className="px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-medium hover:bg-brand-hover transition-colors cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Employee Management (owner only) ── */}
      {ownerMode && (
        <div>
          <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-6">
            <button
              onClick={() => navigate('/team')}
              className="w-full flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Users size={18} className="text-muted" />
                <div className="text-left">
                  <p className="text-sm font-medium text-primary">Employee Management</p>
                  <p className="text-xs text-tertiary">View team members, edit permissions, manage onboarding</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-muted shrink-0" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  return <SettingsContent />;
}
