import { useState, useEffect, lazy, Suspense } from 'react';
import { Pencil, Settings as SettingsIcon, ClipboardList, ClipboardCheck, Users, UserCog, X, Wrench, Calculator, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ChecklistEditorModal = lazy(() => import('../components/ChecklistEditorModal'));
import { EQUIPMENT_TYPES } from '../data';
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

  const [showChecklistEditor, setShowChecklistEditor] = useState(false);
  const [showTeamChecklist, setShowTeamChecklist] = useState(null); // 'start' | 'end' | null

  const equipmentCategories = useAppStore((s) => s.equipmentCategories);
  const setEquipmentCategories = useAppStore((s) => s.setEquipmentCategories);

  const [showCategories, setShowCategories] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');

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

  return (
    <div className="space-y-8">
      {/* ── Preferences ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon size={22} className="text-brand-text" />
          <h2 className="text-2xl font-bold text-primary">Owner Management</h2>
        </div>

      </div>

      {/* ── Owner Quick Links ── */}
      {ownerMode && (
        <div className="bg-card rounded-2xl shadow-lg border border-border-subtle overflow-hidden">
          <div className="p-4 grid grid-cols-2 gap-3">
            {[
              { label: 'Dashboard', desc: 'Daily overview', icon: ClipboardList, path: '/owner-dashboard' },
              { label: 'Quoting', desc: 'Build estimates', icon: Calculator, path: '/quoting' },
              { label: 'Checklists', desc: 'Daily task lists', icon: ClipboardCheck, path: '/checklist-tracker' },
              { label: 'Team', desc: 'Manage employees', icon: UserCog, path: '/team' },
              { label: 'Standards', desc: 'Team expectations', icon: ShieldCheck, path: '/standards' },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-surface-alt hover:bg-brand-light hover:text-brand-text-strong text-secondary transition-colors cursor-pointer"
              >
                <item.icon size={22} />
                <span className="text-xs font-semibold">{item.label}</span>
                <span className="text-[10px] text-muted -mt-1">{item.desc}</span>
              </button>
            ))}
            <button
              onClick={() => setShowChecklistEditor(true)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-surface-alt hover:bg-brand-light hover:text-brand-text-strong text-secondary transition-colors cursor-pointer"
            >
              <Pencil size={22} />
              <span className="text-xs font-semibold">My Checklists</span>
              <span className="text-[10px] text-muted -mt-1">Owner daily lists</span>
            </button>
            <button
              onClick={() => setShowTeamChecklist('start')}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-surface-alt hover:bg-brand-light hover:text-brand-text-strong text-secondary transition-colors cursor-pointer"
            >
              <Users size={22} />
              <span className="text-xs font-semibold">Team Checklists</span>
              <span className="text-[10px] text-muted -mt-1">Team daily lists</span>
            </button>
            <button
              onClick={() => setShowCategories(!showCategories)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-surface-alt hover:bg-brand-light hover:text-brand-text-strong text-secondary transition-colors cursor-pointer"
            >
              <Wrench size={22} />
              <span className="text-xs font-semibold">Equipment</span>
              <span className="text-[10px] text-muted -mt-1">Manage categories</span>
            </button>
          </div>
        </div>
      )}

      {/* Owner Checklist Editor */}
      {showChecklistEditor && (
        <Suspense fallback={null}>
          <ChecklistEditorModal
            onClose={() => setShowChecklistEditor(false)}
            items={ownerStartChecklist}
            setItems={setOwnerStartChecklist}
            title="Edit Morning Checklist"
          />
        </Suspense>
      )}

      {/* Team Checklist Editor */}
      {showTeamChecklist && (
        <Suspense fallback={null}>
          <ChecklistEditorModal
            onClose={() => setShowTeamChecklist(null)}
            items={showTeamChecklist === 'start' ? teamChecklist : teamEndChecklist}
            setItems={showTeamChecklist === 'start' ? setTeamChecklist : setTeamEndChecklist}
            title={showTeamChecklist === 'start' ? 'Team Opening Checklist' : 'Team Closing Checklist'}
            extraHeader={
              <div className="flex gap-1 bg-surface-alt p-1 rounded-xl mx-5 mb-2">
                <button onClick={() => setShowTeamChecklist('start')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${showTeamChecklist === 'start' ? 'bg-card text-primary shadow-sm' : 'text-tertiary hover:text-secondary'}`}>
                  Opening
                </button>
                <button onClick={() => setShowTeamChecklist('end')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${showTeamChecklist === 'end' ? 'bg-card text-primary shadow-sm' : 'text-tertiary hover:text-secondary'}`}>
                  Closing
                </button>
              </div>
            }
          />
        </Suspense>
      )}

      {/* ── Equipment Categories (owner only) ── */}
      {ownerMode && showCategories && (
        <div>
          <div className="bg-card rounded-2xl shadow-lg border border-border-subtle overflow-hidden">
              <div className="px-6 py-6 space-y-4">
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
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  return <SettingsContent />;
}
