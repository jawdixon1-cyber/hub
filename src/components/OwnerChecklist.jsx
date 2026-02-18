import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { genId } from '../data';
import renderLinkedText from '../utils/renderLinkedText';
import { getTodayInTimezone } from '../utils/timezone';

export default function OwnerChecklist({ title, items, setItems, checklistType, checklistLog, setChecklistLog, footer }) {
  const [open, setOpen] = useState(false);

  const checkableItems = items.filter((i) => i.type !== 'header');
  const completedCount = checkableItems.filter((i) => i.done).length;
  const logDebounce = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Reset checks at the start of each new day
  useEffect(() => {
    const storageKey = `greenteam-checklist-date-${checklistType}`;
    const today = () => getTodayInTimezone();

    const resetIfNewDay = () => {
      const saved = localStorage.getItem(storageKey);
      const now = today();
      if (saved !== now) {
        const current = itemsRef.current;
        if (current.some((i) => i.type !== 'header' && i.done)) {
          setItems(current.map((i) => ({ ...i, done: false })));
        }
        localStorage.setItem(storageKey, now);
      }
    };

    resetIfNewDay();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') resetIfNewDay();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [checklistType, setItems]);

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
          completedItems: completedCount,
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
  }, [completedCount, checklistType, setChecklistLog, checkableItems.length]);

  const allDone = checkableItems.length > 0 && completedCount === checkableItems.length;

  const markAll = () => {
    setItems(items.map((i) => (i.type === 'header' ? i : { ...i, done: !allDone })));
  };

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border-subtle">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-6 cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-primary text-lg">{title}</span>
          {allDone ? (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand text-on-brand">
              Completed
            </span>
          ) : (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-light text-brand-text-strong">
              Not completed
            </span>
          )}
        </div>
        <ChevronDown
          size={20}
          className={`text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-6 pb-6">
          <ul className="space-y-2 mb-4">
            {items.map((item) => {
              if (item.type === 'header') {
                return (
                  <h3 key={item.id} className="font-bold text-primary text-sm uppercase tracking-wide pt-3 first:pt-0 break-words overflow-hidden">
                    {renderLinkedText(item.text)}
                  </h3>
                );
              }

              return (
                <li
                  key={item.id}
                  className={`flex items-start gap-2 ${item.indent ? 'ml-8' : ''}`}
                >
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${allDone ? 'bg-brand' : 'bg-muted'}`} />
                  <span
                    className={`flex-1 min-w-0 text-sm break-words transition-colors duration-150 ${
                      allDone ? 'line-through text-muted' : 'text-secondary'
                    }`}
                  >
                    {renderLinkedText(item.text)}
                  </span>
                </li>
              );
            })}
          </ul>

          <button
            onClick={markAll}
            className={`w-full py-3 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
              allDone
                ? 'bg-surface-alt text-secondary hover:bg-surface-strong'
                : 'bg-brand text-on-brand hover:bg-brand-hover'
            }`}
          >
            {allDone ? 'Undo Completion' : 'Mark All Complete'}
          </button>
          {footer}
        </div>
      )}
    </div>
  );
}
