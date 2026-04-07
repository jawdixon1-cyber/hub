import { useState, useEffect } from 'react';
import { Lightbulb, X, Plus, Trash2, ChevronDown } from 'lucide-react';

const STORAGE_KEY = 'hub-feature-ideas';

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'guides', label: 'Playbooks' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'receipts', label: 'Receipts' },
  { id: 'mileage', label: 'Mileage' },
  { id: 'agreement', label: 'Agreement' },
  { id: 'marketing', label: 'Leads' },
  { id: 'sales', label: 'Quotes' },
  { id: 'clients', label: 'Clients' },
  { id: 'labor', label: 'Profitability' },
  { id: 'finance', label: 'Finance' },
  { id: 'settings', label: 'Settings' },
  { id: 'general', label: 'General / App-wide' },
];

function loadIdeas() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveIdeas(ideas) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
}

export default function IdeaBank() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('add'); // 'add' | 'review'
  const [ideas, setIdeas] = useState(loadIdeas);
  const [text, setText] = useState('');
  const [tab, setTab] = useState('general');
  const [filterTab, setFilterTab] = useState('all');

  useEffect(() => {
    saveIdeas(ideas);
  }, [ideas]);

  const addIdea = () => {
    if (!text.trim()) return;
    const idea = {
      id: Date.now(),
      text: text.trim(),
      tab,
      createdAt: new Date().toISOString(),
    };
    setIdeas((prev) => [idea, ...prev]);
    setText('');
  };

  const deleteIdea = (id) => {
    setIdeas((prev) => prev.filter((i) => i.id !== id));
  };

  const tabLabel = (id) => TABS.find((t) => t.id === id)?.label || id;

  const grouped = ideas.reduce((acc, idea) => {
    if (!acc[idea.tab]) acc[idea.tab] = [];
    acc[idea.tab].push(idea);
    return acc;
  }, {});

  const filteredTabs = filterTab === 'all'
    ? Object.keys(grouped).sort()
    : [filterTab].filter((t) => grouped[t]);

  const ideaCount = ideas.length;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 right-4 z-50 w-11 h-11 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg flex items-center justify-center transition-all hover:scale-105 cursor-pointer"
        title="Feature Ideas"
      >
        <Lightbulb size={20} />
        {ideaCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {ideaCount > 99 ? '99+' : ideaCount}
          </span>
        )}
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-16 px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-card rounded-2xl shadow-2xl border border-border-subtle w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
              <div className="flex items-center gap-2">
                <Lightbulb size={20} className="text-amber-500" />
                <h2 className="text-lg font-bold text-primary">Feature Ideas</h2>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 text-muted hover:text-primary cursor-pointer">
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border-subtle shrink-0">
              <button
                onClick={() => setView('add')}
                className={`flex-1 py-3 text-sm font-semibold text-center transition-colors cursor-pointer ${
                  view === 'add' ? 'text-brand border-b-2 border-brand' : 'text-muted hover:text-primary'
                }`}
              >
                <Plus size={14} className="inline mr-1 -mt-0.5" />
                Add Idea
              </button>
              <button
                onClick={() => setView('review')}
                className={`flex-1 py-3 text-sm font-semibold text-center transition-colors cursor-pointer ${
                  view === 'review' ? 'text-brand border-b-2 border-brand' : 'text-muted hover:text-primary'
                }`}
              >
                Review ({ideaCount})
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {view === 'add' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-1.5">Which tab is this for?</label>
                    <select
                      value={tab}
                      onChange={(e) => setTab(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-surface text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                    >
                      {TABS.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-1.5">Feature idea</label>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Describe the feature you want to add..."
                      rows={4}
                      className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-surface text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none placeholder:text-muted"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addIdea();
                      }}
                    />
                  </div>
                  <button
                    onClick={addIdea}
                    disabled={!text.trim()}
                    className="w-full py-2.5 rounded-xl bg-brand text-on-brand font-semibold text-sm hover:bg-brand-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Save Idea
                  </button>
                  <p className="text-[11px] text-muted text-center">Ctrl+Enter to save quickly</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Filter */}
                  <select
                    value={filterTab}
                    onChange={(e) => setFilterTab(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border-subtle bg-surface text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    <option value="all">All Tabs ({ideaCount})</option>
                    {TABS.filter((t) => grouped[t.id]).map((t) => (
                      <option key={t.id} value={t.id}>{t.label} ({grouped[t.id]?.length || 0})</option>
                    ))}
                  </select>

                  {ideas.length === 0 ? (
                    <div className="text-center py-10 text-muted">
                      <Lightbulb size={32} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No ideas yet. Add your first one!</p>
                    </div>
                  ) : (
                    filteredTabs.map((tabId) => (
                      <div key={tabId}>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">{tabLabel(tabId)}</h3>
                        <div className="space-y-2">
                          {grouped[tabId].map((idea) => (
                            <div key={idea.id} className="flex items-start gap-3 bg-surface rounded-xl px-4 py-3 group">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-primary whitespace-pre-wrap">{idea.text}</p>
                                <p className="text-[10px] text-muted mt-1">
                                  {new Date(idea.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                              </div>
                              <button
                                onClick={() => deleteIdea(idea.id)}
                                className="p-1 text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-pointer"
                                title="Delete idea"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
