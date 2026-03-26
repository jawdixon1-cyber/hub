import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Truck } from 'lucide-react';
import { genId } from '../data';

/* ─── Tap-to-edit text ─── */

function EditableText({ value, onChange, className, inputClassName }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const save = () => {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== value) onChange(t);
    else setDraft(value);
  };

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        className={inputClassName}
      />
    );
  }

  return (
    <span onClick={() => setEditing(true)} className={className}>
      {value.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')}
    </span>
  );
}

/* ─── Editor ─── */

export function ChecklistSection({ items, setItems }) {
  const [newItemText, setNewItemText] = useState('');
  const [addingTo, setAddingTo] = useState(null);
  const [newSection, setNewSection] = useState('');
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const addRef = useRef(null);

  const all = items.map((i) => ({
    id: i.id || genId(), text: i.text || '', type: i.type || 'item',
    indent: i.indent || 0, done: i.done || false, links: i.links || [],
  }));

  const update = (id, text) => setItems(all.map((i) => (i.id === id ? { ...i, text } : i)));
  const remove = (id) => setItems(all.filter((i) => i.id !== id));
  const toggleFieldWork = (id) => setItems(all.map((i) => (i.id === id ? { ...i, fieldWorkOnly: !i.fieldWorkOnly } : i)));

  // Drag (items only, not headers)
  const onDragStart = (e, idx) => { setDragFrom(idx); e.dataTransfer.effectAllowed = 'move'; };
  const onDragEnd = () => {
    if (dragFrom != null && dragOver != null && dragFrom !== dragOver) {
      const u = [...all]; const [d] = u.splice(dragFrom, 1); u.splice(dragOver, 0, d); setItems(u);
    }
    setDragFrom(null); setDragOver(null);
  };
  const onDragOver = (e, idx) => { e.preventDefault(); if (idx !== dragOver) setDragOver(idx); };

  // Group by headers
  const groups = [];
  let cur = { header: null, items: [] };
  for (const i of all) {
    if (i.type === 'header') { if (cur.header || cur.items.length) groups.push(cur); cur = { header: i, items: [] }; }
    else cur.items.push(i);
  }
  if (cur.header || cur.items.length) groups.push(cur);

  const moveSection = (gi, dir) => {
    const si = gi + dir;
    if (si < 0 || si >= groups.length) return;
    const g = [...groups]; [g[gi], g[si]] = [g[si], g[gi]];
    setItems(g.flatMap((s) => [s.header, ...s.items].filter(Boolean)));
  };

  const addItem = (afterId) => {
    if (!newItemText.trim()) return;
    const idx = afterId ? all.findIndex((i) => i.id === afterId) + 1 : 0;
    const u = [...all];
    u.splice(idx, 0, { id: genId(), text: newItemText.trim(), type: 'item', indent: 0, done: false, links: [] });
    setItems(u); setNewItemText('');
    setTimeout(() => addRef.current?.focus(), 50);
  };

  const flat = (id) => all.findIndex((i) => i.id === id);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 pb-4">
        {groups.map((g, gi) => {
          const tail = g.items[g.items.length - 1];
          const addAfter = tail?.id || g.header?.id;

          return (
            <div key={g.header?.id || `g${gi}`} className="rounded-2xl border border-border-subtle overflow-hidden">
              {/* Section title */}
              {g.header && (
                <div
                  data-drag-index={flat(g.header.id)}
                  onDragOver={(e) => onDragOver(e, flat(g.header.id))}
                  className={`flex items-center gap-1.5 px-4 py-2.5 bg-surface-alt/50 ${
                    dragOver === flat(g.header.id) && dragFrom != null ? 'ring-1 ring-brand' : ''
                  }`}
                >
                  <EditableText
                    value={g.header.text}
                    onChange={(t) => update(g.header.id, t)}
                    className="flex-1 text-[11px] font-bold text-muted uppercase tracking-widest cursor-text"
                    inputClassName="flex-1 bg-transparent outline-none text-[11px] font-bold text-primary uppercase tracking-widest"
                  />
                  <button onClick={() => moveSection(gi, -1)} disabled={gi === 0} className="p-1 text-muted/30 hover:text-muted disabled:opacity-0 cursor-pointer"><ChevronUp size={13} /></button>
                  <button onClick={() => moveSection(gi, 1)} disabled={gi === groups.length - 1} className="p-1 text-muted/30 hover:text-muted disabled:opacity-0 cursor-pointer"><ChevronDown size={13} /></button>
                  <button onClick={() => remove(g.header.id)} className="p-1 text-muted/20 hover:text-red-500 cursor-pointer"><Trash2 size={12} /></button>
                </div>
              )}

              {/* Items */}
              {g.items.map((item) => {
                const fi = flat(item.id);
                return (
                  <div
                    key={item.id}
                    data-drag-index={fi}
                    draggable
                    onDragStart={(e) => onDragStart(e, fi)}
                    onDragEnd={onDragEnd}
                    onDragOver={(e) => onDragOver(e, fi)}
                    className={`group flex items-center gap-2 px-4 py-2.5 border-t border-border-subtle/40 ${
                      dragFrom === fi ? 'opacity-20' : ''
                    } ${dragOver === fi && dragFrom != null && dragFrom !== fi ? 'border-t-brand border-t-2' : ''}`}
                  >
                    <GripVertical size={12} className="text-muted/20 group-hover:text-muted/50 cursor-grab active:cursor-grabbing shrink-0" />
                    <EditableText
                      value={item.text}
                      onChange={(t) => update(item.id, t)}
                      className="flex-1 text-sm text-primary cursor-text min-w-0"
                      inputClassName="flex-1 w-full bg-transparent outline-none text-sm text-primary"
                    />
                    <button onClick={() => toggleFieldWork(item.id)} className={`p-1 cursor-pointer shrink-0 transition-colors ${item.fieldWorkOnly ? 'text-brand-text' : 'text-transparent group-hover:text-muted/30 hover:!text-brand-text'}`} title="Field work only"><Truck size={12} /></button>
                    <button onClick={() => remove(item.id)} className="p-1 text-transparent group-hover:text-muted/40 hover:!text-red-500 cursor-pointer shrink-0"><Trash2 size={12} /></button>
                  </div>
                );
              })}

              {/* Inline add */}
              <div className="flex items-center gap-2 px-4 py-2 border-t border-border-subtle/30">
                <Plus size={12} className="text-muted/30 shrink-0 ml-[12px]" />
                <input
                  ref={addingTo === addAfter ? addRef : null}
                  value={addingTo === addAfter ? newItemText : ''}
                  onFocus={() => { setAddingTo(addAfter); setNewItemText(''); }}
                  onChange={(e) => setNewItemText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addItem(addAfter); }}
                  placeholder="Add..."
                  className="flex-1 bg-transparent outline-none text-sm text-primary placeholder:text-muted/30"
                />
              </div>
            </div>
          );
        })}

        {all.length === 0 && <p className="text-muted/50 text-sm text-center py-12">Empty</p>}
      </div>

      {/* New section */}
      <div className="shrink-0 flex gap-2 pt-3 border-t border-border-subtle">
        <input
          value={newSection}
          onChange={(e) => setNewSection(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && newSection.trim()) { setItems([...all, { id: genId(), text: newSection.trim(), type: 'header', indent: 0, done: false, links: [] }]); setNewSection(''); } }}
          placeholder="New section..."
          className="flex-1 rounded-xl border border-border-default px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-brand placeholder:text-muted/40"
        />
        <button
          onClick={() => { if (newSection.trim()) { setItems([...all, { id: genId(), text: newSection.trim(), type: 'header', indent: 0, done: false, links: [] }]); setNewSection(''); } }}
          className="px-4 py-2.5 rounded-xl bg-brand text-on-brand text-xs font-semibold hover:bg-brand-hover cursor-pointer shrink-0"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

/* ─── Full-screen editor ─── */

export default function ChecklistEditorModal({ onClose, items, setItems, title, extraHeader }) {
  return (
    <div className="fixed inset-0 z-50 bg-surface">
      <div className="h-full flex flex-col max-w-2xl mx-auto">
        <div className="flex items-center gap-3 px-5 py-4 shrink-0">
          <button onClick={onClose} className="p-2 -ml-2 rounded-xl text-secondary hover:bg-surface-alt cursor-pointer">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-bold text-primary">{title || 'Edit'}</h1>
        </div>
        {extraHeader}
        <div className="flex-1 min-h-0 px-5 pb-5 flex flex-col">
          <ChecklistSection items={items} setItems={setItems} />
        </div>
      </div>
    </div>
  );
}
