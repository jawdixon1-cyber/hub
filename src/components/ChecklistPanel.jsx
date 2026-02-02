import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { genId } from '../data';
import renderLinkedText from '../utils/renderLinkedText';

export default function ChecklistPanel({ title, items, checklistType, checklistLog, setChecklistLog }) {
  const normalized = items.map((item, i) =>
    typeof item === 'string' ? { id: `static-${i}`, text: item } : item
  );

  const [checked, setChecked] = useState(() => new Set());
  const [open, setOpen] = useState(false);
  const logDebounce = useRef(null);

  const checkableItems = normalized.filter((i) => i.type !== 'header');
  const completedCount = checkableItems.filter((i) => checked.has(i.id)).length;

  // Log completion to cloud
  useEffect(() => {
    if (!checklistType || !setChecklistLog || checkableItems.length === 0) return;
    if (logDebounce.current) clearTimeout(logDebounce.current);

    logDebounce.current = setTimeout(() => {
      const today = new Date().toISOString().split('T')[0];
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
        className="w-full flex items-center justify-between p-6 cursor-pointer"
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
        <div className="px-6 pb-6 space-y-2">
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
        </div>
      )}
    </div>
  );
}
