import { useState } from 'react';
import { Check, Circle } from 'lucide-react';
import { useAppStore } from '../../store/AppStoreContext';
import { useAuth } from '../../contexts/AuthContext';
import { genId } from '../../data';
import { useEffect, useRef } from 'react';
import { getTodayInTimezone } from '../../utils/timezone';
import renderLinkedText from '../../utils/renderLinkedText';

function useChecklistDay(items, setItems, checklistType) {
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const storageKey = `greenteam-checklist-date-${checklistType}`;
    const resetIfNewDay = () => {
      const saved = localStorage.getItem(storageKey);
      const now = getTodayInTimezone();
      if (saved !== now) {
        const current = itemsRef.current;
        if (current.some((i) => i.type !== 'header' && i.done)) {
          setItems(current.map((i) => ({ ...i, done: false })));
        }
        localStorage.setItem(storageKey, now);
      }
    };
    resetIfNewDay();
    const onVis = () => { if (document.visibilityState === 'visible') resetIfNewDay(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [checklistType, setItems]);
}

function useChecklistLog(items, checklistType, checklistLog, setChecklistLog) {
  const checkableItems = items.filter((i) => i.type !== 'header');
  const completedCount = checkableItems.filter((i) => i.done).length;
  const logDebounce = useRef(null);

  useEffect(() => {
    if (!checklistType || !setChecklistLog || checkableItems.length === 0) return;
    if (logDebounce.current) clearTimeout(logDebounce.current);
    logDebounce.current = setTimeout(() => {
      const today = getTodayInTimezone();
      setChecklistLog((prev) => {
        const existing = prev.findIndex((e) => e.date === today && e.checklistType === checklistType);
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
    return () => { if (logDebounce.current) clearTimeout(logDebounce.current); };
  }, [completedCount, checklistType, setChecklistLog, checkableItems.length]);

  return { checkableItems, completedCount };
}

function ChecklistRow({ label, items, setItems, checklistType, checklistLog, setChecklistLog }) {
  useChecklistDay(items, setItems, checklistType);
  const { checkableItems, completedCount } = useChecklistLog(items, checklistType, checklistLog, setChecklistLog);

  const allDone = checkableItems.length > 0 && completedCount === checkableItems.length;

  const markAll = () => {
    setItems(items.map((i) => (i.type === 'header' ? i : { ...i, done: !allDone })));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {allDone ? (
            <div className="w-5 h-5 rounded-full bg-brand flex items-center justify-center">
              <Check size={12} className="text-on-brand" />
            </div>
          ) : (
            <Circle size={18} className="text-border-strong" />
          )}
          <span className={`text-sm font-semibold ${allDone ? 'text-muted line-through' : 'text-primary'}`}>
            {label}
          </span>
        </div>
        <button
          onClick={markAll}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            allDone
              ? 'text-muted hover:text-secondary'
              : 'text-brand-text-strong hover:bg-brand-light'
          }`}
        >
          {allDone ? 'Undo' : 'Complete'}
        </button>
      </div>
      {!allDone && (
        <div className="ml-7 space-y-1">
          {items.map((item) => {
            if (item.type === 'header') {
              return (
                <p key={item.id} className="text-xs font-bold uppercase tracking-wide text-primary pt-2 first:pt-0">
                  {renderLinkedText(item.text)}
                </p>
              );
            }
            return (
              <p key={item.id} className={`text-sm text-secondary ${item.indent ? 'ml-4' : ''}`}>
                {renderLinkedText(item.text)}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MyDaySection() {
  const ownerStartChecklist = useAppStore((s) => s.ownerStartChecklist);
  const setOwnerStartChecklist = useAppStore((s) => s.setOwnerStartChecklist);
  const ownerEndChecklist = useAppStore((s) => s.ownerEndChecklist);
  const setOwnerEndChecklist = useAppStore((s) => s.setOwnerEndChecklist);
  const checklistLog = useAppStore((s) => s.checklistLog);
  const setChecklistLog = useAppStore((s) => s.setChecklistLog);

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Daily Checklists</p>
      <ChecklistRow label="Start of Day" items={ownerStartChecklist} setItems={setOwnerStartChecklist} checklistType="owner-start" checklistLog={checklistLog} setChecklistLog={setChecklistLog} />
      <ChecklistRow label="End of Day" items={ownerEndChecklist} setItems={setOwnerEndChecklist} checklistType="owner-end" checklistLog={checklistLog} setChecklistLog={setChecklistLog} />
    </div>
  );
}
