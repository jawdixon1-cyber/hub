import { useState } from 'react';
import { X } from 'lucide-react';

export default function MileageModal({ vehicles, currentUser, onSubmit, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    vehicleId: '',
    odometer: '',
    date: today,
    notes: '',
    loggedBy: currentUser,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-8 py-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X size={24} />
          </button>
          <h2 className="text-2xl font-bold text-white">Log Mileage</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-8 overflow-y-auto space-y-5">
          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Vehicle</label>
            <select
              required
              value={form.vehicleId}
              onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
              className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-primary focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
            >
              <option value="">Select vehicle...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Odometer Reading</label>
            <input
              type="number"
              required
              min="0"
              value={form.odometer}
              onChange={(e) => setForm({ ...form, odometer: e.target.value })}
              className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-primary focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
              placeholder="e.g. 45230"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Date</label>
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-primary focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Notes (optional)</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition resize-y"
              placeholder="Any additional notes..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Logged by</label>
            <input
              type="text"
              value={form.loggedBy}
              readOnly
              className="w-full rounded-lg border border-border-default px-4 py-2.5 text-tertiary bg-surface cursor-not-allowed"
            />
          </div>

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
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium hover:opacity-90 transition-opacity cursor-pointer"
            >
              Log Mileage
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
