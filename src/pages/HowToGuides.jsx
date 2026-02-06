import { useState, useEffect } from 'react';
import { BookOpen, Plus, Search, Sparkles } from 'lucide-react';
import Card from '../components/Card';
import ViewModal from '../components/ViewModal';
import EditModal from '../components/EditModal';
import AIPlaybookModal from '../components/AIPlaybookModal';
import { genId } from '../data';
import { useAppStore } from '../store/AppStoreContext';

const ALL_CATEGORIES = ['Field Team', 'Sales Team', 'General Manager'];

const CATEGORY_TO_TYPE = {
  'Field Team': 'field-team',
  'Sales Team': 'sales',
  'General Manager': 'strategy',
  // Backward compat for existing saved guides
  'Service': 'field-team',
  'Sales': 'sales',
  'Strategy': 'strategy',
};

const TYPE_TO_CATEGORY = {
  'field-team': 'Field Team',
  'service': 'Field Team',
  'equipment': 'Field Team',
  'sales': 'Sales Team',
  'pme': 'Sales Team',
  'strategy': 'General Manager',
  'owner': 'General Manager',
};

const ALL_TABS = [
  { key: 'field-team', label: 'Field Team', activeColor: 'text-brand-text-strong', playbookKey: 'service' },
  { key: 'sales', label: 'Sales Team', activeColor: 'text-purple-700', playbookKey: 'sales' },
  { key: 'strategy', label: 'General Manager', activeColor: 'text-blue-700', playbookKey: 'strategy' },
];

export default function HowToGuides({ ownerMode, allowedPlaybooks }) {
  const items = useAppStore((s) => s.guides);
  const setItems = useAppStore((s) => s.setGuides);

  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const visibleTabs = allowedPlaybooks
    ? ALL_TABS.filter((t) => allowedPlaybooks.includes(t.playbookKey))
    : ALL_TABS;

  const [filter, setFilter] = useState(() => visibleTabs[0]?.key || 'field-team');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.key === filter)) {
      setFilter(visibleTabs[0].key);
    }
  }, [visibleTabs, filter]);

  const query = search.toLowerCase().trim();
  const typeMatch = (itemType) => {
    if (itemType === filter) return true;
    if (filter === 'field-team') return itemType === 'service' || itemType === 'equipment';
    if (filter === 'sales') return itemType === 'pme';
    if (filter === 'strategy') return itemType === 'owner';
    return false;
  };

  // Team members: show all allowed playbooks in a flat list (no category tabs)
  const allowedTypeMatch = (itemType) => {
    return visibleTabs.some((t) => {
      if (t.key === itemType) return true;
      if (t.key === 'field-team') return itemType === 'service' || itemType === 'equipment';
      if (t.key === 'sales') return itemType === 'pme';
      if (t.key === 'strategy') return itemType === 'owner';
      return false;
    });
  };

  const filtered = items.filter((i) => {
    if (query) return allowedTypeMatch(i.type) && (i.title?.toLowerCase().includes(query) || i.summary?.toLowerCase().includes(query));
    if (ownerMode) return typeMatch(i.type);
    return allowedTypeMatch(i.type);
  });

  const handleDelete = (item) => {
    setConfirmDelete(item);
    setConfirmDeleteText('');
  };

  const executeDelete = () => {
    if (confirmDelete) {
      setItems(items.filter((i) => i.id !== confirmDelete.id));
      setConfirmDelete(null);
      setConfirmDeleteText('');
    }
  };

  const handleSave = (form) => {
    const type = CATEGORY_TO_TYPE[form.category] || 'service';
    if (editing) {
      setItems(items.map((i) => (i.id === editing.id ? { ...i, ...form, type } : i)));
    } else {
      setItems([...items, { id: genId(), ...form, type }]);
    }
    setEditing(null);
    setAdding(false);
  };

  const handleAIGenerated = (generated) => {
    const type = CATEGORY_TO_TYPE[generated.category] || 'service';
    const newGuide = {
      id: genId(),
      title: generated.title,
      summary: generated.summary,
      content: generated.content,
      type,
      category: generated.category,
    };
    setItems([...items, newGuide]);
    setShowAIGenerator(false);
    setEditing(newGuide); // Open in edit mode so user can review/adjust
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen size={22} className="text-brand-text" />
            <h2 className="text-2xl font-bold text-primary">Playbooks</h2>
          </div>
          <p className="text-tertiary mt-1">Step-by-step procedures</p>
        </div>
        {ownerMode && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAIGenerator(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 text-white font-medium text-sm hover:bg-purple-700 transition-colors"
            >
              <Sparkles size={18} /> AI Generate
            </button>
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand font-medium text-sm hover:bg-brand-hover transition-colors"
            >
              <Plus size={18} /> Add Guide
            </button>
          </div>
        )}
      </div>

      <div className="relative mb-4">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search playbooks..."
          className="w-full rounded-xl border border-border-default bg-card pl-10 pr-4 py-2.5 text-sm text-primary placeholder-placeholder-muted focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
        />
      </div>

      {ownerMode && (
        <div className="flex items-center gap-1 bg-surface-alt p-1 rounded-xl w-fit mb-6 overflow-x-auto">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                filter === tab.key
                  ? `bg-card ${tab.activeColor} shadow-sm`
                  : 'text-tertiary hover:text-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-muted text-sm">{query ? 'No playbooks match your search.' : ownerMode ? 'No playbooks in this category yet.' : 'No playbooks available yet.'}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <Card
              key={item.id}
              item={item}
              onClick={setViewing}
              onEdit={setEditing}
              onDelete={handleDelete}
              ownerMode={ownerMode}
            />
          ))}
        </div>
      )}

      {viewing && <ViewModal item={viewing} onClose={() => setViewing(null)} />}
      {(editing || adding) && (
        <EditModal
          item={editing ? { ...editing, category: TYPE_TO_CATEGORY[editing.type] || ALL_CATEGORIES[0] } : null}
          categories={ALL_CATEGORIES}
          title="Guide"
          richText
          onSave={handleSave}
          onClose={() => { setEditing(null); setAdding(false); }}
        />
      )}
      {showAIGenerator && (
        <AIPlaybookModal
          onGenerated={handleAIGenerated}
          onClose={() => setShowAIGenerator(false)}
        />
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => { setConfirmDelete(null); setConfirmDeleteText(''); }}
        >
          <div
            className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-primary mb-2">Delete Playbook</h3>
            <p className="text-sm text-secondary mb-4">
              Type <span className="font-bold text-red-600">DELETE</span> to confirm.
            </p>
            <input
              type="text"
              value={confirmDeleteText}
              onChange={(e) => setConfirmDeleteText(e.target.value)}
              placeholder="Type DELETE..."
              className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition mb-4"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setConfirmDelete(null); setConfirmDeleteText(''); }}
                className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmDeleteText !== 'DELETE'}
                onClick={executeDelete}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
