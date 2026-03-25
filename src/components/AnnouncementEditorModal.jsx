import { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Megaphone,
  Archive,
  RotateCcw,
  ChevronDown,
  Check,
  Clock,
  Users,
} from 'lucide-react';
import { genId } from '../data';
import { getTodayInTimezone, getTimezone } from '../utils/timezone';

export default function AnnouncementEditorModal({
  onClose,
  announcements,
  setAnnouncements,
  archivedAnnouncements,
  setArchivedAnnouncements,
  currentUser,
  permissions,
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', message: '', priority: 'normal' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', message: '', priority: 'normal' });
  const [showArchived, setShowArchived] = useState(false);
  const [expandedAckId, setExpandedAckId] = useState(null);

  const teamEmails = Object.keys(permissions || {});

  const handlePost = (e) => {
    e.preventDefault();
    const today = getTodayInTimezone();
    setAnnouncements([
      {
        id: genId(),
        title: form.title,
        message: form.message,
        priority: form.priority,
        date: today,
        postedBy: currentUser,
        acknowledgedBy: {},
      },
      ...announcements,
    ]);
    setForm({ title: '', message: '', priority: 'normal' });
    setShowForm(false);
  };

  const handleStartEdit = (a) => {
    setEditingId(a.id);
    setEditForm({
      title: a.title,
      message: a.message,
      priority: a.priority || 'normal',
    });
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    setAnnouncements(
      announcements.map((a) =>
        a.id === editingId
          ? {
              ...a,
              title: editForm.title,
              message: editForm.message,
              priority: editForm.priority,
            }
          : a
      )
    );
    setEditingId(null);
  };

  const handleArchive = (id) => {
    const item = announcements.find((a) => a.id === id);
    if (item) {
      setArchivedAnnouncements((prev) => [item, ...prev]);
      setAnnouncements(announcements.filter((a) => a.id !== id));
    }
  };

  const handleRestore = (id) => {
    const item = archivedAnnouncements.find((a) => a.id === id);
    if (item) {
      setAnnouncements((prev) => [item, ...prev]);
      setArchivedAnnouncements(archivedAnnouncements.filter((a) => a.id !== id));
    }
  };

  const handlePermanentlyDelete = (id) => {
    if (confirm('Permanently delete this announcement?')) {
      setArchivedAnnouncements(archivedAnnouncements.filter((a) => a.id !== id));
    }
  };

  const getUnacknowledgedCount = (email) => {
    return announcements.filter((a) => !a.acknowledgedBy?.[email]).length;
  };

  const PriorityControls = ({ formState, setFormState }) => (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => setFormState({ ...formState, priority: 'normal' })}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
          formState.priority === 'normal'
            ? 'bg-gray-800 text-white'
            : 'bg-surface-alt text-secondary hover:bg-surface-strong'
        }`}
      >
        Normal
      </button>
      <button
        type="button"
        onClick={() => setFormState({ ...formState, priority: 'high' })}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
          formState.priority === 'high'
            ? 'bg-red-600 text-white'
            : 'bg-surface-alt text-secondary hover:bg-surface-strong'
        }`}
      >
        High
      </button>
    </div>
  );

  const AckLog = ({ announcement }) => {
    const acked = announcement.acknowledgedBy || {};
    const ackedEmails = Object.keys(acked);
    const notAcked = teamEmails.filter((email) => !acked[email]);
    const isExpanded = expandedAckId === announcement.id;

    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpandedAckId(isExpanded ? null : announcement.id);
          }}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-muted hover:text-secondary transition-colors cursor-pointer"
        >
          <ChevronDown
            size={12}
            className={`transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
          />
          <Users size={11} />
          {ackedEmails.length}/{teamEmails.length} acknowledged
        </button>
        {isExpanded && (
          <div className="mt-2 ml-4 space-y-1">
            {ackedEmails.map((email) => (
              <div key={email} className="flex items-center gap-2 text-[11px]">
                <Check size={10} className="text-emerald-500 shrink-0" />
                <span className="font-medium text-primary">{acked[email].name || email}</span>
                <span className="text-muted">
                  {new Date(acked[email].at).toLocaleString('en-US', { timeZone: getTimezone() })}
                </span>
              </div>
            ))}
            {notAcked.map((email) => (
              <div key={email} className="flex items-center gap-2 text-[11px]">
                <Clock size={10} className="text-amber-400 shrink-0" />
                <span className="text-muted">{permissions[email]?.name || email}</span>
                <span className="text-muted italic">not yet</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2">
            <Megaphone size={18} className="text-brand-text" />
            <h2 className="text-lg font-bold text-primary">Announcements</h2>
            {announcements.length > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-light text-brand-text-strong">{announcements.length}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
              >
                <Plus size={14} />
                New
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-muted hover:text-secondary hover:bg-surface-alt transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Per-user unread summary */}
          {teamEmails.length > 0 && (
            <div className="mb-6 pb-4 border-b border-border-subtle">
              <h3 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">Unread per team member</h3>
              <div className="flex flex-wrap gap-2">
                {teamEmails.map((email) => {
                  const count = getUnacknowledgedCount(email);
                  return (
                    <div
                      key={email}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-alt text-xs"
                    >
                      <span className="font-medium text-primary">{permissions[email]?.name || email}</span>
                      {count > 0 ? (
                        <span className="font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px]">
                          {count}
                        </span>
                      ) : (
                        <Check size={12} className="text-emerald-500" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showForm && (
            <form onSubmit={handlePost} className="space-y-4 mb-6 pb-6 border-b border-border-subtle">
              <div>
                <label className="block text-sm font-semibold text-secondary mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
                  placeholder="Announcement title"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-secondary mb-1">Message</label>
                <textarea
                  required
                  rows={3}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
                  placeholder="Write your announcement..."
                />
              </div>
              <PriorityControls formState={form} setFormState={setForm} />
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setForm({ title: '', message: '', priority: 'normal' });
                  }}
                  className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-medium hover:bg-brand-hover transition-colors cursor-pointer"
                >
                  Post
                </button>
              </div>
            </form>
          )}

          {announcements.length === 0 && !showForm ? (
            <p className="text-muted text-sm">No active announcements</p>
          ) : (
            <div className="space-y-2">
              {announcements.map((a) =>
                editingId === a.id ? (
                  <form
                    key={a.id}
                    onSubmit={handleSaveEdit}
                    className="rounded-xl border-2 border-emerald-300 bg-emerald-50/30 p-4 space-y-3"
                  >
                    <div>
                      <label className="block text-xs font-semibold text-secondary mb-1">Title</label>
                      <input
                        type="text"
                        required
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-secondary mb-1">Message</label>
                      <textarea
                        required
                        rows={3}
                        value={editForm.message}
                        onChange={(e) => setEditForm({ ...editForm, message: e.target.value })}
                        className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
                      />
                    </div>
                    <PriorityControls formState={editForm} setFormState={setEditForm} />
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-4 py-1.5 rounded-lg border border-border-strong text-secondary text-xs font-medium hover:bg-surface transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-medium hover:bg-brand-hover transition-colors cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                ) : (
                  <div
                    key={a.id}
                    onClick={() => handleStartEdit(a)}
                    className={`rounded-xl border p-3 group cursor-pointer hover:ring-2 hover:ring-emerald-200 transition-all ${
                      a.priority === 'high' ? 'border-red-200 bg-red-50/50' : 'border-border-subtle'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-primary text-sm">{a.title}</h4>
                          {a.priority === 'high' && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">HIGH</span>
                          )}
                        </div>
                        <p className="text-tertiary text-xs mt-0.5 line-clamp-1">{a.message}</p>
                        <p className="text-muted text-[11px] mt-1">
                          {a.postedBy} &middot; {a.date}
                        </p>
                        <AckLog announcement={a} />
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleArchive(a.id); }}
                        className="p-1.5 rounded-lg text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer shrink-0"
                        title="Archive"
                      >
                        <Archive size={14} />
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {archivedAnnouncements.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border-subtle">
              <button
                onClick={() => setShowArchived((v) => !v)}
                className="flex items-center gap-2 text-xs font-semibold text-muted hover:text-secondary transition-colors cursor-pointer"
              >
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${showArchived ? '' : '-rotate-90'}`}
                />
                {archivedAnnouncements.length} archived
              </button>
              {showArchived && (
                <div className="space-y-2 mt-2">
                  {archivedAnnouncements.map((a) => (
                    <div
                      key={a.id}
                      className={`rounded-xl border p-3 group opacity-50 ${
                        a.priority === 'high' ? 'border-red-200 bg-red-50/50' : 'border-border-subtle'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-primary text-xs">{a.title}</h4>
                          <p className="text-muted text-[11px] mt-0.5">{a.postedBy} &middot; {a.date}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={() => handleRestore(a.id)}
                            className="p-1 rounded text-muted hover:text-brand-text hover:bg-emerald-50 transition-colors cursor-pointer"
                            title="Restore"
                          >
                            <RotateCcw size={12} />
                          </button>
                          <button
                            onClick={() => handlePermanentlyDelete(a.id)}
                            className="p-1 rounded text-muted hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Delete permanently"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
