import { useState, useEffect } from 'react';
import { Lightbulb, MessageSquare, Plus, X, Trash2, CheckCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { genId } from '../data';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';

const STATUS_COLORS = {
  New: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  Reviewing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Implemented: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const TYPE_ICON = {
  idea: { Icon: Lightbulb, color: 'text-amber-500' },
  feedback: { Icon: MessageSquare, color: 'text-blue-500' },
};

export function IdeasFeedbackContent({ filterByUser, compact, autoSubmit }) {
  const { user, ownerMode, currentUser } = useAuth();
  const suggestions = useAppStore((s) => s.suggestions);
  const setSuggestions = useAppStore((s) => s.setSuggestions);

  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(autoSubmit || false);
  const [form, setForm] = useState({ type: 'idea', title: '', description: '' });
  const [successToast, setSuccessToast] = useState(null);

  const baseSuggestions = (filterByUser
    ? suggestions.filter((s) => s.submittedBy === filterByUser)
    : suggestions
  ).filter((s) => s.type !== 'onboarding' && !s.stepId && !s.title?.includes('Policy Acknowledgment'));

  const filtered = filter === 'all'
    ? baseSuggestions
    : baseSuggestions.filter((s) => s.type === filter);

  const handleSubmit = (e) => {
    e.preventDefault();
    const today = new Date().toLocaleDateString('en-US');
    setSuggestions([
      {
        id: genId(),
        type: form.type,
        title: form.title.trim(),
        description: form.description.trim(),
        submittedBy: currentUser,
        submittedByEmail: user?.email?.toLowerCase(),
        date: today,
        status: 'New',
      },
      ...suggestions,
    ]);
    setForm({ type: 'idea', title: '', description: '' });
    setAdding(false);
    setSuccessToast('Thanks for your submission! It\'s been sent to the owner.');
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const handleStatus = (id, newStatus) => {
    setSuggestions(suggestions.map((s) => (s.id === id ? { ...s, status: newStatus } : s)));
  };

  const handleInternalNote = (id, note) => {
    setSuggestions(suggestions.map((s) => (s.id === id ? { ...s, internalNote: note } : s)));
  };

  const handleDelete = (id) => {
    if (confirm('Delete this submission?')) {
      setSuggestions(suggestions.filter((s) => s.id !== id));
    }
  };

  const getPlaceholder = (type, field) => {
    if (field === 'title') {
      if (type === 'idea') return "What's your idea?";
      return 'What could be better?';
    }
    if (type === 'idea') return 'Describe your idea and how it helps the business...';
    return "Describe the issue or what you'd like to see improved...";
  };

  const filterTabs = [
    { key: 'all', label: 'All' },
    { key: 'idea', label: 'Business Ideas' },
    { key: 'feedback', label: 'Software Feedback' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Lightbulb size={compact ? 18 : 22} className="text-amber-500" />
            <h2 className={`${compact ? 'text-lg' : 'text-2xl'} font-bold text-primary`}>
              {filterByUser ? 'My Ideas & Feedback' : 'Ideas & Feedback'}
            </h2>
          </div>
          {!compact && (
            <p className="text-tertiary mt-1">Submit ideas to improve the business or feedback on the software</p>
          )}
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-white font-medium text-sm hover:bg-amber-600 transition-colors cursor-pointer"
          >
            <Plus size={18} /> Submit
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-primary">New Submission</h3>
            <button onClick={() => { setAdding(false); setForm({ type: 'idea', title: '', description: '' }); }} className="p-1.5 rounded-lg text-muted hover:text-secondary hover:bg-surface cursor-pointer">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-secondary mb-2">What type?</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, type: 'idea' })}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                    form.type === 'idea'
                      ? 'bg-amber-500 text-white'
                      : 'bg-surface-alt text-secondary hover:bg-surface-strong'
                  }`}
                >
                  <Lightbulb size={16} />
                  Business Idea
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, type: 'feedback' })}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                    form.type === 'feedback'
                      ? 'bg-blue-500 text-white'
                      : 'bg-surface-alt text-secondary hover:bg-surface-strong'
                  }`}
                >
                  <MessageSquare size={16} />
                  Software Feedback
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-secondary mb-1">Title</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition"
                placeholder={getPlaceholder(form.type, 'title')}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-secondary mb-1">Description</label>
              <textarea
                required
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition resize-y"
                placeholder={getPlaceholder(form.type, 'description')}
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => { setAdding(false); setForm({ type: 'idea', title: '', description: '' }); }}
                className="px-5 py-2.5 rounded-lg border border-border-strong text-secondary font-medium hover:bg-surface transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors cursor-pointer"
              >
                Submit
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex items-center gap-1 bg-surface-alt p-1 rounded-xl w-fit mb-6 overflow-x-auto">
        {filterTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
              filter === t.key
                ? 'bg-card text-primary shadow-sm'
                : 'text-tertiary hover:text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-12 text-center">
          <Lightbulb size={40} className="text-muted mx-auto mb-3" />
          <p className="text-muted text-sm">
            {baseSuggestions.length === 0
              ? filterByUser
                ? 'You haven\'t submitted any ideas or feedback yet.'
                : 'No submissions yet. Be the first to share an idea or give feedback!'
              : 'No submissions in this category.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => {
            const typeInfo = TYPE_ICON[item.type] || TYPE_ICON.idea;
            const ItemIcon = typeInfo.Icon;
            return (
              <div
                key={item.id}
                className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <ItemIcon size={16} className={`${typeInfo.color} shrink-0`} />
                      <h3 className="text-base font-bold text-primary">{item.title}</h3>
                    </div>
                    <p className="text-sm text-secondary mt-1 ml-6 whitespace-pre-line">{item.description}</p>
                    <div className="flex items-center gap-3 mt-3 ml-6">
                      <p className="text-xs text-muted">
                        {item.submittedBy} &middot; {item.date}
                      </p>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[item.status] || 'bg-surface-alt text-secondary'}`}>
                        {item.status}
                      </span>
                    </div>
                    {ownerMode && (
                      <div className="flex flex-wrap gap-2 mt-3 ml-6">
                        {['New', 'Reviewing', 'Approved', 'Implemented', 'Rejected']
                          .filter((s) => s !== item.status)
                          .map((s) => (
                            <button
                              key={s}
                              onClick={() => handleStatus(item.id, s)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${STATUS_COLORS[s]} hover:opacity-80`}
                            >
                              {s}
                            </button>
                          ))}
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-400 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors cursor-pointer"
                        >
                          <Trash2 size={12} />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Success toast */}
      {successToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-[fadeIn_0.2s_ease-out]">
          <CheckCircle size={18} />
          <span className="text-sm font-medium">{successToast}</span>
        </div>
      )}
    </div>
  );
}

export default function IdeasFeedback() {
  const [searchParams, setSearchParams] = useSearchParams();
  const autoOpen = searchParams.get('submit') === '1';

  useEffect(() => {
    if (autoOpen) {
      setSearchParams({}, { replace: true });
    }
  }, [autoOpen, setSearchParams]);

  return <IdeasFeedbackContent autoSubmit={autoOpen} />;
}
