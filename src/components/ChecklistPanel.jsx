import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Gauge } from 'lucide-react';
import { genId } from '../data';
import renderLinkedText from '../utils/renderLinkedText';
import { getTodayInTimezone } from '../utils/timezone';

export default function ChecklistPanel({ title, items, checklistType, checklistLog, setChecklistLog, mileage }) {
  const normalized = items.map((item, i) =>
    typeof item === 'string' ? { id: `static-${i}`, text: item } : item
  );

  const [checked, setChecked] = useState(() => new Set());
  const [open, setOpen] = useState(false);
  const logDebounce = useRef(null);
  const dateRef = useRef(getTodayInTimezone());

  // Reset checks if the tab is revisited on a new day (midnight crossing)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        const now = getTodayInTimezone();
        if (dateRef.current !== now) {
          setChecked(new Set());
          dateRef.current = now;
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const checkableItems = normalized.filter((i) => i.type !== 'header');
  const completedCount = checkableItems.filter((i) => checked.has(i.id)).length;

  // Log completion to cloud
  useEffect(() => {
    if (!checklistType || !setChecklistLog || checkableItems.length === 0) return;
    if (logDebounce.current) clearTimeout(logDebounce.current);

    logDebounce.current = setTimeout(() => {
      const today = getTodayInTimezone();
      setChecklistLog((prev) => {
        const existing = prev.findIndex(
          (e) => e.date === today && e.checklistType === checklistType
        );
        const entry = {
          id: existing >= 0 ? prev[existing].id : genId(),
          date: today,
          checklistType,
          totalItems: checkableItems.length,
          completedItems: checked.size,
          updatedAt: new Date().toISOString(),
        };
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = entry;
          return updated;
        }
        return [...prev, entry];
      });
    }, 800);

    return () => {
      if (logDebounce.current) clearTimeout(logDebounce.current);
    };
  }, [checked, checklistType, setChecklistLog, checkableItems.length]);

  const toggle = (id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border-subtle">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 sm:p-6 cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-primary text-lg">{title}</span>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-light text-brand-text-strong">
            {completedCount}/{checkableItems.length} completed
          </span>
        </div>
        <ChevronDown
          size={20}
          className={`text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 sm:px-6 sm:pb-6 space-y-2">
          {normalized.map((item) => {
            if (item.type === 'header') {
              return (
                <h3 key={item.id} className="font-bold text-primary text-sm uppercase tracking-wide pt-3 first:pt-0 break-words overflow-hidden">
                  {renderLinkedText(item.text)}
                </h3>
              );
            }
            return (
              <label
                key={item.id}
                className="flex items-center gap-3 cursor-pointer group"
                style={item.indent ? { marginLeft: `${item.indent * 24}px` } : undefined}
              >
                <input
                  type="checkbox"
                  checked={checked.has(item.id)}
                  onChange={() => toggle(item.id)}
                  className="w-5 h-5 rounded accent-emerald-600 shrink-0"
                />
                <span
                  className={`flex-1 min-w-0 text-sm break-words transition-colors duration-150 ${
                    checked.has(item.id) ? 'line-through text-muted' : 'text-secondary'
                  }`}
                >
                  {renderLinkedText(item.text)}
                </span>
              </label>
            );
          })}
          {mileage && <InlineMileageForm vehicles={mileage.vehicles} onSubmit={mileage.onSubmit} />}
        </div>
      )}
    </div>
  );
}

function InlineMileageForm({ vehicles, onSubmit }) {
  const [vehicleId, setVehicleId] = useState('');
  const [odometer, setOdometer] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!vehicleId || !odometer) return;
    onSubmit({ vehicleId, odometer });
    setVehicleId('');
    setOdometer('');
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
  };

  return (
    <div className="mt-4 pt-4 border-t border-border-subtle">
      <div className="flex items-center gap-2 mb-3">
        <Gauge size={18} className="text-emerald-500" />
        <span className="font-bold text-primary text-sm">Log Mileage</span>
      </div>
      <div className="space-y-2">
        <select
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-primary text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
        >
          <option value="">Select vehicle...</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            placeholder="Odometer reading"
            className="flex-1 rounded-lg border border-border-strong bg-card px-4 py-2.5 text-primary text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
          />
          <button
            onClick={handleSubmit}
            disabled={!vehicleId || !odometer}
            className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Submit
          </button>
        </div>
        {submitted && (
          <p className="text-xs text-emerald-500 font-medium">Mileage logged!</p>
        )}
      </div>
    </div>
  );
}
