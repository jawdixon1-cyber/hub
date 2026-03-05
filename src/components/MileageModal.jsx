import { useState, useRef, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';

const dn = (v) => v.nickname || [v.year, v.make, v.model].filter(Boolean).join(' ') || v.name || '';
const desc = (v) => {
  const parts = [v.year, v.make, v.model].filter(Boolean).join(' ');
  return v.nickname && parts ? parts : '';
};

function VehicleSelect({ vehicles, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = vehicles.find((v) => v.id === value);

  const sorted = vehicles;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-lg border border-border-strong bg-card px-4 py-2.5 text-left focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition cursor-pointer"
      >
        {selected ? (
          <span className="flex items-center gap-2">
            <span className="text-primary">{dn(selected)}</span>
            {desc(selected) && <span className="text-xs text-muted">{desc(selected)}</span>}
          </span>
        ) : (
          <span className="text-placeholder-muted">Select vehicle...</span>
        )}
        <ChevronDown size={16} className={`text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-card rounded-xl border border-border-subtle shadow-xl max-h-60 overflow-y-auto">
          {sorted.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => { onChange(v.id); setOpen(false); }}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-surface-alt transition-colors cursor-pointer ${
                v.id === value ? 'bg-surface-alt' : ''
              }`}
            >
              <span className="text-sm text-primary">{dn(v)}</span>
              {desc(v) && <span className="text-xs text-muted">{desc(v)}</span>}
            </button>
          ))}
        </div>
      )}
      {/* Hidden input for form validation */}
      <input type="text" required value={value} onChange={() => {}} className="sr-only" tabIndex={-1} />
    </div>
  );
}

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
            <VehicleSelect
              vehicles={vehicles}
              value={form.vehicleId}
              onChange={(id) => setForm({ ...form, vehicleId: id })}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Total Miles Driven</label>
            <input
              type="number"
              required
              min="0"
              value={form.odometer}
              onChange={(e) => setForm({ ...form, odometer: e.target.value })}
              className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-primary focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
              placeholder="e.g. 30"
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
