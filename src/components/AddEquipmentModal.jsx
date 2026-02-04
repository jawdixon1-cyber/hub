import { useState } from 'react';
import { X } from 'lucide-react';
import { EQUIPMENT_TYPES } from '../data';

export default function AddEquipmentModal({ onSave, onClose, equipmentCategories = [] }) {
  const allTypes = equipmentCategories.length > 0 ? equipmentCategories : EQUIPMENT_TYPES;
  const [form, setForm] = useState({
    name: '',
    type: 'mower',
    serialNumber: '',
    manualUrl: '',
    status: 'operational',
    reportedIssue: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      name: form.name,
      type: form.type,
      serialNumber: form.serialNumber,
      manualUrl: form.manualUrl,
      status: form.status,
    };
    if (form.status === 'needs-repair') {
      data.reportedIssue = form.reportedIssue;
      data.urgency = 'critical';
      data.reportedBy = 'Owner';
      data.reportedDate = new Date().toLocaleDateString('en-US');
    }
    onSave(data);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        className="bg-card rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-700 px-8 py-6 relative shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
          <h2 className="text-2xl font-bold text-white">Add Equipment</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-5 overflow-y-auto">
          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Equipment Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
              placeholder="e.g. Toro TimeCutter 42in Zero-Turn #2"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
            >
              {allTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Serial Number</label>
            <input
              type="text"
              value={form.serialNumber}
              onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
              className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
              placeholder="e.g. 400425612"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Manual Link</label>
            <input
              type="text"
              value={form.manualUrl}
              onChange={(e) => setForm({ ...form, manualUrl: e.target.value })}
              className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
              placeholder="https://example.com/manual.pdf or unknown"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
            >
              <option value="operational">Operational</option>
              <option value="needs-repair">Needs Repair</option>
            </select>
          </div>
          {form.status === 'needs-repair' && (
            <div>
              <label className="block text-sm font-semibold text-secondary mb-1">What's Wrong?</label>
              <textarea
                required
                rows={3}
                value={form.reportedIssue}
                onChange={(e) => setForm({ ...form, reportedIssue: e.target.value })}
                className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition resize-y"
                placeholder="Describe what's wrong..."
              />
            </div>
          )}
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
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
