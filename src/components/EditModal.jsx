import { useState, useRef, Suspense, lazy } from 'react';
import { X } from 'lucide-react';

const RichTextEditor = lazy(() => import('./RichTextEditor'));

export default function EditModal({ item, categories, onSave, onClose, title, richText }) {
  const [form, setForm] = useState(() =>
    item
      ? { title: item.title || '', category: item.category || (categories?.[0]) || '', content: item.content || '' }
      : { title: '', category: (categories?.[0]) || '', content: '' }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const mouseDownTarget = useRef(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => { mouseDownTarget.current = e.target; }}
      onMouseUp={(e) => {
        if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) {
          onClose();
        }
        mouseDownTarget.current = null;
      }}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-700 px-8 py-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
          <h2 className="text-2xl font-bold text-white">
            {item ? 'Edit' : 'Add'} {title}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-8 overflow-y-auto space-y-5">
          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Title</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
            />
          </div>
          {categories && categories.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-secondary mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Content</label>
            {richText ? (
              <Suspense fallback={<div className="text-tertiary py-4 text-center">Loading editor...</div>}>
                <RichTextEditor
                  content={form.content}
                  onChange={(html) => setForm(prev => ({ ...prev, content: html }))}
                />
              </Suspense>
            ) : (
              <textarea
                required
                rows={12}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition resize-y min-h-[300px]"
              />
            )}
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg border border-border-strong text-secondary font-medium hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg bg-brand text-on-brand font-medium hover:bg-brand-hover transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
