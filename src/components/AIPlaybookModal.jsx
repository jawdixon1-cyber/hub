import { useState } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';

const CATEGORY_OPTIONS = [
  { value: 'Field Team', label: 'Field Team' },
  { value: 'Sales Team', label: 'Sales Team' },
  { value: 'General Manager', label: 'General Manager' },
];

export default function AIPlaybookModal({ onGenerated, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    serviceName: '',
    category: 'Field Team',
    nonNegotiables: '',
  });

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const canGenerate = form.serviceName.trim() && form.nonNegotiables.trim();

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/generate-playbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceName: form.serviceName,
          category: form.category,
          nonNegotiables: form.nonNegotiables,
        }),
      });

      const text = await response.text();

      if (!text) {
        throw new Error('Empty response from server. The request may have timed out. Please try again.');
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Invalid response from server. Please try again.');
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate playbook');
      }

      onGenerated({
        title: form.serviceName,
        content: data.content,
        category: form.category,
        summary: `${form.serviceName} playbook for ${form.category}`,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-purple-500" />
            <h2 className="text-lg font-bold text-primary">AI Playbook Generator</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-alt transition-colors"
          >
            <X size={20} className="text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-1.5">
              Service name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.serviceName}
              onChange={(e) => updateForm('serviceName', e.target.value)}
              placeholder="e.g., Mowing, Mulching, Leaf Cleanup"
              className="w-full rounded-lg border border-border-default bg-surface px-4 py-2.5 text-primary placeholder-placeholder-muted focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1.5">
              Who is this for?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateForm('category', opt.value)}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    form.category === opt.value
                      ? 'bg-purple-100 text-purple-700 border-2 border-purple-500'
                      : 'bg-surface-alt text-secondary border-2 border-transparent hover:bg-surface-strong'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1.5">
              Non-negotiables <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.nonNegotiables}
              onChange={(e) => updateForm('nonNegotiables', e.target.value)}
              placeholder="Your must-dos — e.g., 2-3 stripes clockwise, clippings discharge inward, blow beds last"
              rows={3}
              className="w-full rounded-lg border border-border-default bg-surface px-4 py-2.5 text-primary placeholder-placeholder-muted focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition resize-none"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 pt-0">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
