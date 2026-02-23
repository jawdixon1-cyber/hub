import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Gauge, Check } from 'lucide-react';
import { genId } from '../data';
import renderLinkedText from '../utils/renderLinkedText';
import { getTodayInTimezone } from '../utils/timezone';

/* ─── Hold-to-Check Item (same style as owner DailyChecklist) ─── */

function ChecklistItem({ item, checked, onToggle }) {
  const [justCompleted, setJustCompleted] = useState(false);
  const done = checked;

  const handleClick = useCallback(() => {
    if (!done) {
      setJustCompleted(true);
      setTimeout(() => setJustCompleted(false), 600);
    }
    onToggle(item.id);
  }, [done, item.id, onToggle]);

  return (
    <div
      className={`relative overflow-hidden rounded-xl px-4 py-3 select-none transition-all duration-300 ${
        done
          ? 'bg-brand-light/50 cursor-pointer'
          : 'bg-card hover:bg-surface-alt cursor-pointer active:scale-[0.98]'
      } ${item.indent ? 'ml-6' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
    >
      {justCompleted && (
        <div className="absolute inset-0 dc-sweep-fill" />
      )}
      <div className="relative flex items-center gap-3">
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-300 ${
          done ? 'bg-brand border-brand' : 'border-border-strong'
        }`}>
          {done && (
            <Check size={14} className={`text-on-brand ${justCompleted ? 'dc-check-appear' : ''}`} />
          )}
        </div>
        <span className={`text-sm transition-all duration-300 ${
          done ? 'text-muted line-through' : 'text-primary'
        }`}>
          {renderLinkedText(item.text)}
        </span>
      </div>
    </div>
  );
}

/* ─── Mileage Checklist Row ─── */

function MileageRow({ vehicles, onSubmit }) {
  const [expanded, setExpanded] = useState(false);
  const [vehicleId, setVehicleId] = useState('');
  const [odometer, setOdometer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  const handleRowClick = () => {
    if (!submitted) setExpanded((prev) => !prev);
  };

  const handleSubmit = () => {
    if (!vehicleId || !odometer) return;
    onSubmit({ vehicleId, odometer });
    setSubmitted(true);
    setJustCompleted(true);
    setTimeout(() => setJustCompleted(false), 600);
    setExpanded(false);
  };

  return (
    <div
      className={`relative overflow-hidden rounded-xl select-none transition-all duration-300 ${
        submitted
          ? 'bg-brand-light/50'
          : 'bg-card hover:bg-surface-alt active:scale-[0.98]'
      }`}
    >
      {justCompleted && (
        <div className="absolute inset-0 dc-sweep-fill" />
      )}
      {/* Row header — looks like a normal checklist item */}
      <div
        className="relative flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={handleRowClick}
        role="button"
        tabIndex={0}
      >
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-300 ${
          submitted ? 'bg-brand border-brand' : 'border-border-strong'
        }`}>
          {submitted && (
            <Check size={14} className={`text-on-brand ${justCompleted ? 'dc-check-appear' : ''}`} />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Gauge size={16} className={submitted ? 'text-muted' : 'text-emerald-500'} />
          <span className={`text-sm transition-all duration-300 ${
            submitted ? 'text-muted line-through' : 'text-primary'
          }`}>
            Log mileage
          </span>
        </div>
      </div>

      {/* Expanded inline form */}
      {expanded && !submitted && (
        <div className="px-4 pb-3 space-y-2">
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
        </div>
      )}
    </div>
  );
}

/* ─── Main ChecklistPanel ─── */

export default function ChecklistPanel({ title, items, checklistType, checklistLog, setChecklistLog, mileage }) {
  const normalized = useMemo(() =>
    items.map((item, i) =>
      typeof item === 'string' ? { id: `static-${i}`, text: item } : item
    ), [items]);

  const [checked, setChecked] = useState(() => new Set());
  const [mileageSubmitted, setMileageSubmitted] = useState(false);
  const logDebounce = useRef(null);
  const dateRef = useRef(getTodayInTimezone());

  // Reset checks on new day
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        const now = getTodayInTimezone();
        if (dateRef.current !== now) {
          setChecked(new Set());
          setMileageSubmitted(false);
          dateRef.current = now;
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const checkableItems = useMemo(() => normalized.filter((i) => i.type !== 'header'), [normalized]);
  const regularCheckedCount = checkableItems.filter((i) => checked.has(i.id)).length;
  const allRegularChecked = checkableItems.length > 0 && regularCheckedCount === checkableItems.length;

  // Total completion includes mileage when present
  const hasMileage = !!mileage;
  const totalSteps = checkableItems.length + (hasMileage ? 1 : 0);
  const completedSteps = regularCheckedCount + (hasMileage && mileageSubmitted ? 1 : 0);
  const allChecked = totalSteps > 0 && completedSteps === totalSteps;

  // Log completion to cloud
  useEffect(() => {
    if (!checklistType || !setChecklistLog || totalSteps === 0) return;
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
          totalItems: totalSteps,
          completedItems: completedSteps,
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
    return () => { if (logDebounce.current) clearTimeout(logDebounce.current); };
  }, [checked, mileageSubmitted, checklistType, setChecklistLog, totalSteps, completedSteps]);

  const toggleItem = useCallback((id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = () => {
    if (allRegularChecked) {
      setChecked(new Set());
    } else {
      setChecked(new Set(checkableItems.map((i) => i.id)));
    }
  };

  const handleMileageSubmit = (data) => {
    mileage.onSubmit(data);
    setMileageSubmitted(true);
  };

  // Group items by headers
  const groups = useMemo(() => {
    const result = [];
    let currentGroup = null;
    for (const item of normalized) {
      if (item.type === 'header') {
        if (currentGroup) result.push(currentGroup);
        currentGroup = { header: item.text, items: [] };
      } else if (currentGroup) {
        currentGroup.items.push(item);
      } else {
        if (!result.length || result[result.length - 1].header !== null) {
          result.push({ header: null, items: [] });
        }
        result[result.length - 1].items.push(item);
      }
    }
    if (currentGroup) result.push(currentGroup);
    // If no headers at all, wrap everything in one group
    if (result.length === 0 && checkableItems.length > 0) {
      result.push({ header: null, items: checkableItems });
    }
    return result;
  }, [normalized, checkableItems]);

  // Button label logic
  const getButtonLabel = () => {
    if (allChecked) return 'Undo';
    if (allRegularChecked && hasMileage && !mileageSubmitted) return 'Log mileage to finish';
    return 'Complete All';
  };

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{completedSteps}/{totalSteps} completed</p>
        {allChecked && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
            <Check size={12} />
            Done
          </span>
        )}
      </div>

      {/* All checklist items in one card */}
      <div className="bg-card rounded-2xl border border-border-subtle overflow-hidden shadow-sm">
        {groups.map((group, gi) => {
          const isLastGroup = gi === groups.length - 1;
          // Insert mileage row before the last item in the last group
          const insertMileageBefore = hasMileage && isLastGroup && group.items.length > 0
            ? group.items.length - 1
            : null;

          return (
            <div key={gi}>
              {group.header && (
                <div className={`px-4 py-3 border-b border-border-subtle ${gi > 0 ? 'border-t' : ''}`}>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                    {renderLinkedText(group.header)}
                  </h3>
                </div>
              )}
              <div className="p-2 space-y-1">
                {group.items.map((item, ii) => (
                  <div key={item.id}>
                    {insertMileageBefore === ii && (
                      <div className="mb-1">
                        <MileageRow
                          vehicles={mileage.vehicles}
                          onSubmit={handleMileageSubmit}
                        />
                      </div>
                    )}
                    <ChecklistItem
                      item={item}
                      checked={checked.has(item.id)}
                      onToggle={toggleItem}
                    />
                  </div>
                ))}
                {/* Fallback: if no items in last group, show mileage at the end */}
                {hasMileage && isLastGroup && group.items.length === 0 && (
                  <MileageRow
                    vehicles={mileage.vehicles}
                    onSubmit={handleMileageSubmit}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Complete All / Undo */}
      <button
        onClick={toggleAll}
        disabled={allRegularChecked && hasMileage && !mileageSubmitted}
        className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
          allChecked
            ? 'bg-surface-alt text-secondary border border-border-subtle hover:bg-surface'
            : allRegularChecked && hasMileage && !mileageSubmitted
              ? 'bg-surface-alt text-secondary border border-border-subtle cursor-default'
              : 'bg-brand text-on-brand hover:bg-brand-hover'
        }`}
      >
        {getButtonLabel()}
      </button>
    </div>
  );
}
