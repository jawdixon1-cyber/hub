import { useState, useRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, GripVertical, ChevronRight, Calendar, ChevronUp, ChevronDown, Cloud } from 'lucide-react';
import { genId } from '../data';

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* Tap-to-edit text */
function EditableText({ value, onChange, className, inputClassName }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);

  const save = () => {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== value) onChange(t);
    else setDraft(value);
  };

  if (editing) {
    return (
      <input
        ref={(el) => { ref.current = el; if (el) el.focus(); }}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        className={inputClassName}
      />
    );
  }

  return (
    <span onClick={() => { setDraft(value); setEditing(true); }} className={className}>
      {value.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')}
    </span>
  );
}

/* Day picker chip with inline expandable picker */
function DayChip({ days = [], onChange }) {
  const [open, setOpen] = useState(false);
  const isDaily = !days || days.length === 0;
  const label = isDaily ? 'Daily' : days.join(' ');

  const toggle = (d) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    onChange(next.length === 7 || next.length === 0 ? [] : next);
  };

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
          isDaily ? 'bg-surface-alt text-muted hover:text-primary' : 'bg-brand/15 text-brand'
        }`}
      >
        <Calendar size={11} />
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 rounded-2xl border border-card-border bg-card shadow-xl p-2 flex gap-1">
            {ALL_DAYS.map((d) => {
              const active = days.includes(d);
              const allDays = isDaily;
              return (
                <button
                  key={d}
                  onClick={(e) => { e.stopPropagation(); toggle(d); }}
                  className={`px-2.5 py-2 rounded-lg text-[11px] font-black uppercase cursor-pointer ${
                    active || allDays
                      ? (allDays ? 'bg-brand/15 text-brand' : 'bg-brand text-black')
                      : 'bg-surface-alt text-muted hover:text-primary'
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* Editor section */
export function ChecklistSection({ items, setItems, kind }) {
  const [newItemText, setNewItemText] = useState('');
  const [addingTo, setAddingTo] = useState(null);
  const [newSection, setNewSection] = useState('');
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const addRef = useRef(null);

  // The editor shows steps only, but section headers (💼 Work / 🏠 Personal) and every
  // extra field on a step (panel, action, …) must survive an edit. Keep all fields, and
  // put each header back in front of the step it came before.
  const all = items
    .filter((i) => (i.type || 'item') !== 'header')
    .map((i) => ({
      ...i,
      id: i.id || genId(), text: i.text || '', type: i.type || 'item',
      indent: i.indent || 0, done: i.done || false, links: i.links || [],
    }));
  const headerAnchors = (() => {
    const out = [];
    items.forEach((it, idx) => {
      if ((it.type || 'item') !== 'header') return;
      const next = items.slice(idx + 1).find((x) => (x.type || 'item') !== 'header');
      out.push({ header: it, anchorId: next?.id || null });
    });
    return out;
  })();
  const setItemsKeepHeaders = (list) => {
    const placed = new Set();
    const result = [];
    for (const it of list) {
      for (const h of headerAnchors) if (h.anchorId === it.id && !placed.has(h.header.id)) { result.push(h.header); placed.add(h.header.id); }
      result.push(it);
    }
    for (const h of headerAnchors) if (!placed.has(h.header.id)) result.push(h.header);
    setItems(result);
  };

  const weatherEnabled = all.some((i) => i.type === 'weather');
  const toggleWeather = () => {
    if (weatherEnabled) {
      setItemsKeepHeaders(all.filter((i) => i.type !== 'weather'));
    } else {
      setItemsKeepHeaders([
        { id: genId(), text: 'Weather Check', type: 'weather', indent: 0, done: false, links: [] },
        ...all,
      ]);
    }
  };

  const update = (id, text) => setItemsKeepHeaders(all.map((i) => (i.id === id ? { ...i, text } : i)));
  const remove = (id) => setItemsKeepHeaders(all.filter((i) => i.id !== id));
  const setDays = (id, days) => setItemsKeepHeaders(all.map((i) => (i.id === id ? { ...i, days: days.length ? days : undefined } : i)));
  const moveBy = (id, delta) => {
    const idx = all.findIndex((i) => i.id === id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= all.length) return;
    const next = [...all];
    [next[idx], next[target]] = [next[target], next[idx]];
    setItemsKeepHeaders(next);
  };

  // Sequential numbering across all non-header items so the user sees true order.
  const itemNumbers = (() => {
    const map = new Map();
    let n = 0;
    for (const i of all) if (i.type !== 'header') map.set(i.id, ++n);
    return map;
  })();

  // Drag
  const onDragStart = (e, idx) => { setDragFrom(idx); e.dataTransfer.effectAllowed = 'move'; };
  const onDragEnd = () => {
    if (dragFrom != null && dragOver != null && dragFrom !== dragOver) {
      const u = [...all]; const [d] = u.splice(dragFrom, 1); u.splice(dragOver, 0, d); setItemsKeepHeaders(u);
    }
    setDragFrom(null); setDragOver(null);
  };
  const onDragOver = (e, idx) => { e.preventDefault(); if (idx !== dragOver) setDragOver(idx); };

  const addItem = (afterId) => {
    if (!newItemText.trim()) return;
    const idx = afterId ? all.findIndex((i) => i.id === afterId) + 1 : 0;
    const u = [...all];
    u.splice(idx, 0, { id: genId(), text: newItemText.trim(), type: 'item', indent: 0, done: false, links: [] });
    setItemsKeepHeaders(u); setNewItemText('');
    setTimeout(() => addRef.current?.focus(), 50);
  };
  const flat = (id) => all.findIndex((i) => i.id === id);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-card-border bg-card px-4 py-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Cloud size={16} className="text-sky-600 shrink-0" />
          <div>
            <p className="text-sm font-black text-primary">Weather Check</p>
            <p className="text-[11px] font-bold text-tertiary">Adds a live-weather step you can drag into place</p>
          </div>
        </div>
        <button
          onClick={toggleWeather}
          className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors cursor-pointer ${weatherEnabled ? 'bg-primary' : 'bg-surface-strong'}`}
          aria-pressed={weatherEnabled}
        >
          <span className={`absolute w-5 h-5 rounded-full bg-card shadow transition-transform ${weatherEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        {(() => {
          const tail = all[all.length - 1];
          const addAfter = tail?.id || null;
          return (
            <div>
              <div className="rounded-2xl border border-card-border bg-card overflow-hidden">
                {all.map((item, ii) => {
                  const fi = flat(item.id);
                  return (
                    <div
                      key={item.id}
                      data-drag-index={fi}
                      draggable
                      onDragStart={(e) => onDragStart(e, fi)}
                      onDragEnd={onDragEnd}
                      onDragOver={(e) => onDragOver(e, fi)}
                      className={`group flex items-center gap-2 pl-2 pr-2 py-2.5 ${
                        ii > 0 ? 'border-t border-card-border/40' : ''
                      } ${dragFrom === fi ? 'opacity-30' : ''} ${
                        dragOver === fi && dragFrom != null && dragFrom !== fi ? 'border-t-brand border-t-2' : ''
                      }`}
                    >
                      <GripVertical size={14} className="text-muted/30 group-hover:text-muted/60 cursor-grab active:cursor-grabbing shrink-0 hidden sm:block" />
                      <span className="shrink-0 w-7 text-center text-[11px] font-black text-muted tabular-nums">
                        {itemNumbers.get(item.id)}
                      </span>
                      {item.type === 'weather' && (
                        <Cloud size={14} className="text-sky-600 shrink-0" />
                      )}
                      <EditableText
                        value={item.text}
                        onChange={(t) => update(item.id, t)}
                        className={`flex-1 cursor-text min-w-0 text-sm break-words ${item.type === 'weather' ? 'font-black text-primary' : 'font-medium text-primary'}`}
                        inputClassName="flex-1 w-full bg-transparent outline-none text-sm font-medium text-primary"
                      />
                      {item.type === 'weather' && (
                        <span className="shrink-0 text-[10px] font-bold text-tertiary uppercase tracking-wider">Live</span>
                      )}
                      <div className="flex flex-col shrink-0">
                        <button
                          onClick={() => moveBy(item.id, -1)}
                          disabled={fi === 0}
                          className="p-0.5 text-muted/40 hover:text-primary cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          onClick={() => moveBy(item.id, 1)}
                          disabled={fi === all.length - 1}
                          className="p-0.5 text-muted/40 hover:text-primary cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                      <DayChip days={item.days || []} onChange={(d) => setDays(item.id, d)} />
                      {kind && (
                        <RouterLink
                          to={`/checklist/${kind}/${item.id}`}
                          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface-alt cursor-pointer"
                          title="Open details · SOP, sub-checklist, links"
                        >
                          <ChevronRight size={16} />
                        </RouterLink>
                      )}
                      <button onClick={() => remove(item.id)} className="p-1.5 text-muted/30 hover:text-red-400 cursor-pointer shrink-0" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}

                {/* Inline add */}
                <div className="flex items-center gap-2 px-3 py-2 border-t border-card-border/40 bg-surface-alt/30">
                  <Plus size={14} className="text-muted/40 shrink-0" />
                  <input
                    ref={addingTo === addAfter ? addRef : null}
                    value={addingTo === addAfter ? newItemText : ''}
                    onFocus={() => { setAddingTo(addAfter); setNewItemText(''); }}
                    onChange={(e) => setNewItemText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addItem(addAfter); }}
                    placeholder="Add step..."
                    className="flex-1 bg-transparent outline-none text-sm text-primary placeholder:text-muted/50"
                  />
                </div>
              </div>
            </div>
          );
        })()}

        {all.length === 0 && <p className="text-muted/50 text-sm text-center py-12">Empty</p>}
      </div>
    </div>
  );
}

/* Full-screen modal */
export default function ChecklistEditorModal({ onClose, items, setItems, title, extraHeader, kind }) {
  return (
    <div className="fixed inset-0 z-50 bg-surface">
      <div className="h-full flex flex-col max-w-3xl mx-auto">
        <div className="flex items-center gap-3 px-5 py-4 shrink-0">
          <button onClick={onClose} className="p-2 -ml-2 rounded-xl text-secondary hover:bg-surface-alt cursor-pointer">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-black text-primary tracking-tight">{title || 'Edit'}</h1>
        </div>
        {extraHeader}
        <div className="flex-1 min-h-0 px-5 pb-5 flex flex-col">
          <ChecklistSection items={items} setItems={setItems} kind={kind} />
        </div>
      </div>
    </div>
  );
}
