import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, ArrowLeft } from 'lucide-react';
import Card from '../components/Card';
import EditModal from '../components/EditModal';
import { genId } from '../data';
import { useAppStore } from '../store/AppStoreContext';
import { toSlug } from '../utils/slug';

const ALL_CATEGORIES = ['Team', 'Office'];

const CATEGORY_TO_TYPE = {
  'Team': 'service',
  'Office': 'strategy',
  // Backward compat for existing saved guides
  'Field Team': 'service',
  'General Manager': 'strategy',
  'Services': 'service',
  'Service': 'service',
  'Equipment': 'service',
  'Software': 'service',
  'Executive Assistant': 'service',
  'Sales Team': 'service',
  'Sales': 'service',
  'Strategy': 'strategy',
};

const TYPE_TO_CATEGORY = {
  'field-team': 'Team',
  'service': 'Team',
  'equipment': 'Team',
  'software': 'Team',
  'sales': 'Team',
  'pme': 'Team',
  'strategy': 'Office',
  'owner': 'Office',
  'gm-rhythm': 'Office',
  'gm-people': 'Office',
  'gm-sales': 'Office',
};

const ALL_TABS = [
  { key: 'field-team', label: 'Team', activeColor: 'text-brand-text-strong', playbookKey: 'service' },
  { key: 'strategy', label: 'Office', activeColor: 'text-blue-700 dark:text-blue-300', playbookKey: 'strategy' },
];

export default function HowToGuides({ ownerMode, allowedPlaybooks }) {
  const navigate = useNavigate();
  const items = useAppStore((s) => s.guides);
  const setItems = useAppStore((s) => s.setGuides);

  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get('role');
  const effectiveAllowed = roleParam === 'gm' ? ['strategy']
    : roleParam === 'field' ? ['service']
    : allowedPlaybooks;
  const visibleTabs = effectiveAllowed
    ? ALL_TABS.filter((t) => effectiveAllowed.includes(t.playbookKey))
    : ALL_TABS;

  const [search, setSearch] = useState('');

  const query = search.toLowerCase().trim();

  const FIELD_TEAM_TYPES = ['service', 'equipment', 'software', 'field-team', 'sales', 'pme'];
  const GM_TYPES = ['strategy', 'owner', 'gm-rhythm', 'gm-people', 'gm-sales'];

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
    const slug = form.slug || toSlug(form.title);
    if (editing) {
      setItems(items.map((i) => (i.id === editing.id ? { ...i, ...form, type, slug } : i)));
    } else {
      setItems([...items, { id: genId(), ...form, type, slug }]);
    }
    setEditing(null);
    setAdding(false);
  };

  const sectionItems = (key) => {
    const types = key === 'field-team' ? FIELD_TEAM_TYPES : GM_TYPES;
    return items.filter((i) => {
      if (!types.includes(i.type)) return false;
      if (!query) return true;
      return i.title?.toLowerCase().includes(query) || i.summary?.toLowerCase().includes(query);
    });
  };

  return (
    <div>
      <button onClick={() => navigate('/')} className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary cursor-pointer mb-4">
        <ArrowLeft size={16} /> Home
      </button>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">Playbooks</h1>
        </div>
        {ownerMode && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand font-medium text-sm hover:bg-brand-hover transition-colors"
            >
              <Plus size={18} /> Create Playbook
            </button>
          </div>
        )}
      </div>

      <div className="relative mb-6">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search playbooks..."
          className="w-full rounded-xl border border-border-default bg-card pl-10 pr-4 py-2.5 text-sm text-primary placeholder-placeholder-muted focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
        />
      </div>

      {visibleTabs.map((tab) => {
        const sectionGuides = sectionItems(tab.key);
        return (
          <section key={tab.key} className="mb-10">
            <h2 className={`text-lg font-bold mb-3 ${tab.activeColor}`}>{tab.label}</h2>
            {sectionGuides.length === 0 ? (
              <p className="text-muted text-sm">{query ? 'No playbooks match your search.' : ownerMode ? 'No playbooks in this section yet.' : 'No playbooks available yet.'}</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {sectionGuides.map((item) => (
                  <Card
                    key={item.id}
                    item={item}
                    onClick={() => navigate(`/guides/${item.id}`, { state: { tab: tab.key } })}
                    onEdit={setEditing}
                    onDelete={handleDelete}
                    ownerMode={ownerMode}
                    themed
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

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
