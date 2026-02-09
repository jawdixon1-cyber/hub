import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const QUEST_TYPES = [
  { value: 'daily', label: 'Daily', color: 'text-amber-600' },
  { value: 'weekly', label: 'Weekly', color: 'text-blue-600' },
  { value: 'monthly', label: 'Monthly', color: 'text-purple-600' },
  { value: 'bounty', label: 'Bounty', color: 'text-rose-600' },
];

export default function CreateQuestModal({ quest, onSave, onClose }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'daily',
    xp: 25,
    reward: '',
    scope: 'individual',
    targetCount: 5,
    expiresAt: '',
  });

  useEffect(() => {
    if (quest) {
      setForm({
        title: quest.title || '',
        description: quest.description || '',
        type: quest.type || 'daily',
        xp: quest.xp || 25,
        reward: quest.reward || '',
        scope: quest.scope || 'individual',
        targetCount: quest.targetCount || 5,
        expiresAt: quest.expiresAt || '',
      });
    }
  }, [quest]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      title: form.title.trim(),
      description: form.description.trim(),
      type: form.type,
      xp: Number(form.xp),
      reward: form.reward.trim(),
      scope: form.scope,
      targetCount: form.scope === 'team' ? Number(form.targetCount) : 1,
      expiresAt: form.type === 'bounty' && form.expiresAt ? form.expiresAt : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-8 py-6 relative shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X size={24} />
          </button>
          <h2 className="text-2xl font-bold text-white">
            {quest ? 'Edit Quest' : 'Create Quest'}
          </h2>
          <p className="text-white/70 text-sm mt-1">
            {quest ? 'Update this quest for the team' : 'Add a new quest for the team to complete'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5 overflow-y-auto">
          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Quest Title</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              placeholder="e.g. Morning Equipment Check"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Description</label>
            <textarea
              required
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition resize-y"
              placeholder="What does the team need to do?"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-secondary mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              >
                {QUEST_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-secondary mb-1">XP Reward</label>
              <input
                type="number"
                required
                min={1}
                max={1000}
                value={form.xp}
                onChange={(e) => setForm({ ...form, xp: e.target.value })}
                className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Bonus Reward (optional)</label>
            <input
              type="text"
              value={form.reward}
              onChange={(e) => setForm({ ...form, reward: e.target.value })}
              className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              placeholder="e.g. $50 gift card, team lunch"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-secondary mb-1">Scope</label>
              <select
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value })}
                className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              >
                <option value="individual">Individual</option>
                <option value="team">Team</option>
              </select>
            </div>
            {form.scope === 'team' && (
              <div>
                <label className="block text-sm font-semibold text-secondary mb-1">Target Count</label>
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={form.targetCount}
                  onChange={(e) => setForm({ ...form, targetCount: e.target.value })}
                  className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                />
              </div>
            )}
          </div>

          {form.type === 'bounty' && (
            <div>
              <label className="block text-sm font-semibold text-secondary mb-1">Expires On</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              />
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg border border-border-strong text-secondary font-medium hover:bg-surface transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium hover:from-indigo-600 hover:to-purple-700 transition-all cursor-pointer"
            >
              {quest ? 'Save Changes' : 'Create Quest'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
