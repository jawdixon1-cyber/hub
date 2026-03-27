import { useState, useEffect, lazy, Suspense } from 'react';
import { ClipboardCheck, Wrench, X, ChevronRight, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ChecklistEditorModal = lazy(() => import('../components/ChecklistEditorModal'));
const TeamManagement = lazy(() => import('./TeamManagement'));
import { EQUIPMENT_TYPES } from '../data';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';

/* ─── Settings Nav ─── */

const SETTINGS_NAV = [
  { id: 'checklists', label: 'Checklists', icon: ClipboardCheck },
  { id: 'team', label: 'Team', icon: Users },
];

/* ─── Equipment Section ─── */

function EquipmentSection() {
  const equipmentCategories = useAppStore((s) => s.equipmentCategories);
  const setEquipmentCategories = useAppStore((s) => s.setEquipmentCategories);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');

  useEffect(() => {
    if (equipmentCategories.length === 0) setEquipmentCategories([...EQUIPMENT_TYPES]);
  }, []);

  const addCategory = () => {
    const label = newCategoryLabel.trim();
    if (!label) return;
    const value = label.toLowerCase().replace(/\s+/g, '-');
    if (equipmentCategories.some((c) => c.value === value)) return;
    setEquipmentCategories([...equipmentCategories, { value, label }]);
    setNewCategoryLabel('');
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-primary">Equipment Categories</h2>
      <p className="text-xs text-muted">Add or remove equipment types your team can log.</p>
      {equipmentCategories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {equipmentCategories.map((cat) => (
            <span key={cat.value} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-surface-alt text-secondary border border-border-subtle">
              {cat.label}
              <button onClick={() => setEquipmentCategories(equipmentCategories.filter((c) => c.value !== cat.value))}
                className="ml-0.5 p-0.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors cursor-pointer">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input type="text" value={newCategoryLabel} onChange={(e) => setNewCategoryLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); }}
          placeholder="e.g. Trailer, Edger, Sprayer"
          className="flex-1 rounded-lg border border-border-default bg-card px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-ring-brand outline-none" />
        <button onClick={addCategory} className="px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-medium hover:bg-brand-hover cursor-pointer">Add</button>
      </div>
    </div>
  );
}

/* ─── Checklists Section (all 4 in one view) ─── */

function ChecklistsSection() {
  const [showEditor, setShowEditor] = useState(null); // 'owner-start' | 'owner-end' | 'team-start' | 'team-end'

  const ownerStart = useAppStore((s) => s.ownerStartChecklist);
  const setOwnerStart = useAppStore((s) => s.setOwnerStartChecklist);
  const ownerEnd = useAppStore((s) => s.ownerEndChecklist);
  const setOwnerEnd = useAppStore((s) => s.setOwnerEndChecklist);
  const teamStart = useAppStore((s) => s.teamChecklist);
  const setTeamStart = useAppStore((s) => s.setTeamChecklist);
  const teamEnd = useAppStore((s) => s.teamEndChecklist);
  const setTeamEnd = useAppStore((s) => s.setTeamEndChecklist);

  const editorMap = {
    'owner-start': { items: ownerStart, setItems: setOwnerStart, title: 'Owner — Start of Day' },
    'owner-end': { items: ownerEnd, setItems: setOwnerEnd, title: 'Owner — End of Day' },
    'team-start': { items: teamStart, setItems: setTeamStart, title: 'Team — Opening' },
    'team-end': { items: teamEnd, setItems: setTeamEnd, title: 'Team — Closing' },
  };

  const active = showEditor ? editorMap[showEditor] : null;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-primary">Checklists</h2>

      {/* Owner */}
      <div>
        <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-2">Owner</p>
        <div className="space-y-2">
          <button onClick={() => setShowEditor('owner-start')}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border-subtle hover:border-border-strong cursor-pointer transition-colors">
            <span className="text-sm font-medium text-primary">Start of Day</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted">{ownerStart.filter((i) => i.type !== 'header').length} items</span>
              <ChevronRight size={16} className="text-muted" />
            </div>
          </button>
          <button onClick={() => setShowEditor('owner-end')}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border-subtle hover:border-border-strong cursor-pointer transition-colors">
            <span className="text-sm font-medium text-primary">End of Day</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted">{ownerEnd.filter((i) => i.type !== 'header').length} items</span>
              <ChevronRight size={16} className="text-muted" />
            </div>
          </button>
        </div>
      </div>

      {/* Team */}
      <div>
        <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-2">Team</p>
        <div className="space-y-2">
          <button onClick={() => setShowEditor('team-start')}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border-subtle hover:border-border-strong cursor-pointer transition-colors">
            <span className="text-sm font-medium text-primary">Opening</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted">{teamStart.filter((i) => i.type !== 'header').length} items</span>
              <ChevronRight size={16} className="text-muted" />
            </div>
          </button>
          <button onClick={() => setShowEditor('team-end')}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border-subtle hover:border-border-strong cursor-pointer transition-colors">
            <span className="text-sm font-medium text-primary">Closing</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted">{teamEnd.filter((i) => i.type !== 'header').length} items</span>
              <ChevronRight size={16} className="text-muted" />
            </div>
          </button>
        </div>
      </div>

      {/* Editor modal */}
      {active && (
        <Suspense fallback={null}>
          <ChecklistEditorModal
            onClose={() => setShowEditor(null)}
            items={active.items}
            setItems={active.setItems}
            title={active.title}
          />
        </Suspense>
      )}
    </div>
  );
}

/* ─── Legacy export for Profile.jsx ─── */
export function SettingsContent() { return null; }

/* ─── Main Settings Page ─── */

export default function Settings() {
  const { ownerMode } = useAuth();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('checklists');

  if (!ownerMode) { navigate('/'); return null; }

  return (
    <div className="flex gap-6 min-h-[calc(100vh-8rem)]">
      {/* Left sidebar — desktop */}
      <div className="w-48 shrink-0 hidden sm:block">
        <h2 className="text-lg font-bold text-primary mb-4">Settings</h2>
        <nav className="space-y-1">
          {SETTINGS_NAV.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button key={item.id} onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  active ? 'bg-brand-light text-brand-text-strong' : 'text-secondary hover:bg-surface-alt hover:text-primary'
                }`}>
                <Icon size={16} className="shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Mobile tab bar */}
      <div className="sm:hidden flex gap-1 bg-surface-alt p-1 rounded-xl mb-4 w-full absolute top-0 left-0 right-0 mx-4">
        {SETTINGS_NAV.map((item) => (
          <button key={item.id} onClick={() => setActiveSection(item.id)}
            className={`flex-1 py-2 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
              activeSection === item.id ? 'bg-card text-primary shadow-sm' : 'text-muted'
            }`}>
            {item.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {activeSection === 'checklists' && <ChecklistsSection />}

        {activeSection === 'team' && (
          <Suspense fallback={<div className="text-center py-8 text-muted text-sm">Loading...</div>}>
            <TeamManagement />
          </Suspense>
        )}

      </div>
    </div>
  );
}
