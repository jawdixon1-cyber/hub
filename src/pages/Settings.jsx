import { useState, lazy, Suspense } from 'react';
import { Shield, Plus, ChevronUp, ChevronRight, Eye, EyeOff, Pencil, Trash2, X, Check, Sun, Moon, Clock, Globe, Settings as SettingsIcon, ClipboardList, GraduationCap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ChecklistEditorModal = lazy(() => import('../components/ChecklistEditorModal'));
import { createSignUpClient } from '../lib/supabase';
import { MODULE_LIST, ONBOARDING_STEPS } from './Training';
import { useTheme } from '../contexts/ThemeContext';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';

const PLAYBOOK_OPTIONS = [
  { key: 'service', label: 'Field Team', color: 'bg-emerald-100 text-emerald-700' },
  { key: 'sales', label: 'Sales Team', color: 'bg-purple-100 text-purple-700' },
  { key: 'strategy', label: 'General Manager', color: 'bg-blue-100 text-blue-700' },
];

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
  const permissions = useAppStore((s) => s.permissions);
  const setPermissions = useAppStore((s) => s.setPermissions);

  const { theme, themeMode, setThemeMode } = useTheme();
  const [timezone, setTimezone] = useState(() => localStorage.getItem(TZ_STORAGE_KEY) || '');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPlaybooks, setSelectedPlaybooks] = useState(['service']);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [editingEmail, setEditingEmail] = useState(null);
  const [editPlaybooks, setEditPlaybooks] = useState([]);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [showChecklistEditor, setShowChecklistEditor] = useState(false);
  const trainingConfig = useAppStore((s) => s.trainingConfig);
  const setTrainingConfig = useAppStore((s) => s.setTrainingConfig);

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

  const members = Object.entries(permissions).map(([memberEmail, data]) => ({
    email: memberEmail,
    name: data.name,
    playbooks: data.playbooks || [],
  }));

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setSelectedPlaybooks(['service']);
    setFormError('');
  };

  const togglePlaybook = (key, list, setter) => {
    setter(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    setFormError('');

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
      const signUpClient = createSignUpClient();
      const { error } = await signUpClient.auth.signUp({
        email: trimmedEmail,
        password,
        options: { data: { display_name: trimmedName, role: 'member' } },
      });

      if (error) {
        if (error.message?.includes('already registered')) {
          // Auth account exists — just add them to the permissions map
          setPermissions({
            ...permissions,
            [trimmedEmail]: { name: trimmedName, playbooks: selectedPlaybooks },
          });
          resetForm();
          setShowForm(false);
          return;
        } else if (error.message?.includes('password')) {
          setFormError('Password is too weak. Use at least 6 characters.');
        } else {
          setFormError(error.message || 'Failed to create account.');
        }
        return;
      }

      setPermissions({
        ...permissions,
        [trimmedEmail]: { name: trimmedName, playbooks: selectedPlaybooks },
      });
      resetForm();
      setShowForm(false);
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setFormLoading(false);
    }
  };

  const startEdit = (member) => {
    setEditingEmail(member.email);
    setEditPlaybooks([...member.playbooks]);
  };

  const saveEdit = () => {
    if (!editingEmail) return;
    setPermissions({
      ...permissions,
      [editingEmail]: { ...permissions[editingEmail], playbooks: editPlaybooks },
    });
    setEditingEmail(null);
    setEditPlaybooks([]);
  };

  const cancelEdit = () => {
    setEditingEmail(null);
    setEditPlaybooks([]);
  };

  const removeMember = (memberEmail) => {
    const next = { ...permissions };
    delete next[memberEmail];
    setPermissions(next);
    setConfirmRemove(null);
  };

  return (
    <div className="space-y-8">
      {/* ── Preferences ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon size={22} className="text-brand-text" />
          <h2 className="text-2xl font-bold text-primary">Settings</h2>
        </div>

        <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-6 space-y-6">
          <h3 className="text-sm font-bold text-secondary uppercase tracking-wider">Preferences</h3>

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

      {/* ── Training Modules (owner only) ── */}
      {ownerMode && (
        <div>
          <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-6">
            <div className="flex items-center gap-3 mb-4">
              <GraduationCap size={18} className="text-muted" />
              <div>
                <p className="text-sm font-medium text-primary">Training Modules</p>
                <p className="text-xs text-tertiary">Edit sections, content, and team-specific training from each module page</p>
              </div>
            </div>

            {/* Onboarding steps */}
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Onboarding Steps</p>
            <div className="space-y-2 mb-4">
              {ONBOARDING_STEPS.map((step) => {
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
            </div>

            {/* Module list — navigates to module pages for editing */}
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Modules</p>
            <div className="space-y-2">
              {MODULE_LIST.map((mod) => {
                const showModule = !mod.optional || trainingConfig?.showModule5;
                if (!showModule) return null;
                return (
                  <button
                    key={mod.id}
                    onClick={() => navigate(`/training/${mod.id}`)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border-default hover:bg-surface transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <mod.icon size={16} className={mod.color} />
                      <span className="text-sm font-medium text-primary truncate">{mod.title}</span>
                    </div>
                    <ChevronRight size={14} className="text-muted shrink-0" />
                  </button>
                );
              })}
            </div>

            {/* Module 5 toggle */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border-subtle">
              <div>
                <p className="text-sm font-medium text-primary">Module 5 (Optional)</p>
                <p className="text-xs text-tertiary">Show Refinement &amp; Adaptation module</p>
              </div>
              <button
                onClick={() => setTrainingConfig({ ...trainingConfig, showModule5: !trainingConfig?.showModule5 })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  trainingConfig?.showModule5 ? 'bg-brand' : 'bg-surface-alt border border-border-default'
                }`}
                aria-label="Toggle Module 5 visibility"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                    trainingConfig?.showModule5 ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Team Management (owner only) ── */}
      {ownerMode && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2">
                <Shield size={22} className="text-brand-text" />
                <h2 className="text-2xl font-bold text-primary">Team Members</h2>
              </div>
              <p className="text-tertiary mt-1">Manage team members and playbook access</p>
            </div>
            <button
              onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand font-medium text-sm hover:bg-brand-hover transition-colors"
            >
              {showForm ? <ChevronUp size={18} /> : <Plus size={18} />}
              {showForm ? 'Close' : 'Add Member'}
            </button>
          </div>

          {/* Add Member Form */}
          {showForm && (
            <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-6 mb-6">
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
                        onClick={() => togglePlaybook(opt.key, selectedPlaybooks, setSelectedPlaybooks)}
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

          {/* Team Members List */}
          {members.length === 0 ? (
            <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-8 text-center">
              <p className="text-muted text-sm">No team members added yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.email}
                  className="bg-card rounded-2xl shadow-lg border border-border-subtle p-4 sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-primary truncate">{member.name}</h4>
                      <p className="text-sm text-tertiary truncate">{member.email}</p>
                      {editingEmail === member.email ? (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {PLAYBOOK_OPTIONS.map((opt) => (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => togglePlaybook(opt.key, editPlaybooks, setEditPlaybooks)}
                              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${
                                editPlaybooks.includes(opt.key)
                                  ? `${opt.color} border-current`
                                  : 'bg-surface text-muted border-border-default'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {member.playbooks.length > 0 ? (
                            member.playbooks.map((key) => {
                              const opt = PLAYBOOK_OPTIONS.find((o) => o.key === key);
                              return opt ? (
                                <span key={key} className={`px-2 py-0.5 rounded-md text-xs font-medium ${opt.color}`}>
                                  {opt.label}
                                </span>
                              ) : null;
                            })
                          ) : (
                            <span className="text-xs text-muted">No playbook access</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {editingEmail === member.email ? (
                        <>
                          <button
                            onClick={saveEdit}
                            className="p-2 rounded-lg text-brand-text hover:bg-brand-light transition-colors"
                            title="Save"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-2 rounded-lg text-muted hover:bg-surface transition-colors"
                            title="Cancel"
                          >
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(member)}
                            className="p-2 rounded-lg text-muted hover:text-brand-text hover:bg-brand-light transition-colors"
                            title="Edit permissions"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setConfirmRemove(member.email)}
                            className="p-2 rounded-lg text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Remove member"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
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
                  They will see "Access Denied" on their next login. Their auth account cannot be deleted from here.
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
                    className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  return <SettingsContent />;
}
