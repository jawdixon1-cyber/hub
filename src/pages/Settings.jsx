import { useState, lazy, Suspense } from 'react';
import { ChevronRight, ChevronDown, Pencil, Sun, Moon, Clock, Globe, Settings as SettingsIcon, ClipboardList, GraduationCap, Users, RotateCcw, AlertTriangle, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ChecklistEditorModal = lazy(() => import('../components/ChecklistEditorModal'));
import { MODULE_LIST, ONBOARDING_STEPS } from './Training';
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
  const [resetMember, setResetMember] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetToast, setResetToast] = useState(null);

  const permissions = useAppStore((s) => s.permissions);
  const trainingConfig = useAppStore((s) => s.trainingConfig);
  const setTrainingConfig = useAppStore((s) => s.setTrainingConfig);
  const suggestions = useAppStore((s) => s.suggestions);
  const setSuggestions = useAppStore((s) => s.setSuggestions);

  const memberEntries = Object.entries(permissions || {}).map(([email, p]) => ({
    email,
    name: p.name || email,
  }));

  const teamChecklist = useAppStore((s) => s.teamChecklist);
  const setTeamChecklist = useAppStore((s) => s.setTeamChecklist);
  const teamEndChecklist = useAppStore((s) => s.teamEndChecklist);
  const setTeamEndChecklist = useAppStore((s) => s.setTeamEndChecklist);
  const ownerStartChecklist = useAppStore((s) => s.ownerStartChecklist);
  const setOwnerStartChecklist = useAppStore((s) => s.setOwnerStartChecklist);
  const ownerEndChecklist = useAppStore((s) => s.ownerEndChecklist);
  const setOwnerEndChecklist = useAppStore((s) => s.setOwnerEndChecklist);

  const showResetToast = (msg) => {
    setResetToast(msg);
    setTimeout(() => setResetToast(null), 4000);
  };

  const handleResetTraining = () => {
    if (!resetMember) return;
    const member = memberEntries.find((m) => m.email === resetMember);
    if (!member) return;

    // 1. Clear action completions for this member
    const updated = { ...trainingConfig };
    if (updated.actionCompletions?.[member.email]) {
      updated.actionCompletions = { ...updated.actionCompletions };
      delete updated.actionCompletions[member.email];
    }
    setTrainingConfig(updated);

    // 2. Remove onboarding & training suggestions submitted by this member
    const filtered = suggestions.filter(
      (s) =>
        !((s.type === 'onboarding' || s.type === 'training') && s.submittedBy === member.name)
    );
    setSuggestions(filtered);

    setConfirmReset(false);
    setResetMember('');
    showResetToast(`Training reset for ${member.name}`);
  };

  const handleTimezoneChange = (value) => {
    setTimezone(value);
    if (value) {
      localStorage.setItem(TZ_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(TZ_STORAGE_KEY);
    }
  };

  return (
    <div className="space-y-8">
      {/* Toast */}
      {resetToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium shadow-lg flex items-center gap-2 max-w-sm text-center">
          <Check size={16} className="shrink-0" />
          {resetToast}
        </div>
      )}

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

      {/* ── Training Modules (owner only) ── */}
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
                  <p className="text-sm font-medium text-primary">Training Modules</p>
                  <p className="text-xs text-tertiary">Edit sections, content, and team-specific training</p>
                </div>
              </div>
              <ChevronDown size={16} className={`text-muted shrink-0 transition-transform duration-200 ${showTraining ? 'rotate-180' : ''}`} />
            </button>

            {showTraining && (
              <div className="px-6 pb-6 border-t border-border-subtle pt-4">
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

                {/* Module list */}
                <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Modules</p>
                <div className="space-y-2">
                  {MODULE_LIST.map((mod) => (
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
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Reset Training (owner only) ── */}
      {ownerMode && memberEntries.length > 0 && (
        <div>
          <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-6">
            <div className="flex items-center gap-3 mb-4">
              <RotateCcw size={18} className="text-muted" />
              <div>
                <p className="text-sm font-medium text-primary">Reset Training</p>
                <p className="text-xs text-tertiary">Clear onboarding and training progress for a team member</p>
              </div>
            </div>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-secondary block mb-1">Team Member</label>
                <select
                  value={resetMember}
                  onChange={(e) => setResetMember(e.target.value)}
                  className="w-full rounded-lg border border-border-default bg-card px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
                >
                  <option value="">Select a member…</option>
                  {memberEntries.map((m) => (
                    <option key={m.email} value={m.email}>{m.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => resetMember && setConfirmReset(true)}
                disabled={!resetMember}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Confirmation Modal */}
          {confirmReset && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-card rounded-2xl shadow-xl border border-border-subtle max-w-sm w-full p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                    <AlertTriangle size={20} className="text-red-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-primary">Reset Training?</h3>
                    <p className="text-sm text-secondary">
                      This will clear all onboarding and training progress for{' '}
                      <span className="font-semibold">{memberEntries.find((m) => m.email === resetMember)?.name}</span>.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-tertiary">
                  Action item completions, signatures, and submitted onboarding/training updates will be permanently removed.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setConfirmReset(false)}
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
        </div>
      )}

      {/* ── Team Management (owner only) ── */}
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
                  <p className="text-sm font-medium text-primary">Team Management</p>
                  <p className="text-xs text-tertiary">Add members, edit permissions, view onboarding progress</p>
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
