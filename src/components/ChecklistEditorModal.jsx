import { useState, useRef } from 'react';
import {
  X,
  GripVertical,
  Plus,
  Trash2,
  Pencil,
  Check,
  ChevronRight,
  ChevronLeft,
  Type,
  Link,
} from 'lucide-react';
import { genId } from '../data';
import renderLinkedText from '../utils/renderLinkedText';

function normalizeItem(item) {
  return {
    id: item.id || genId(),
    text: item.text || '',
    type: item.type || 'item',
    indent: item.indent || 0,
    done: item.done || false,
  };
}

function normalizeItems(items) {
  return items.map(normalizeItem);
}

function ChecklistSection({ title, items, setItems }) {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [addText, setAddText] = useState('');
  const [addType, setAddType] = useState('item');
  const [selectedId, setSelectedId] = useState(null);
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const editInputRef = useRef(null);

  const normalized = normalizeItems(items);

  const handleDragStart = (index) => {
    dragItem.current = index;
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    dragOverItem.current = index;
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) return;

    const updated = [...normalized];
    const [dragged] = updated.splice(dragItem.current, 1);
    updated.splice(dragOverItem.current, 0, dragged);
    setItems(updated);

    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleDragEnd = () => {
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditText(item.text);
    setSelectedId(null);
  };

  const saveEdit = () => {
    if (editText.trim()) {
      setItems(normalized.map((i) => (i.id === editingId ? { ...i, text: editText.trim() } : i)));
    }
    setEditingId(null);
    setEditText('');
  };

  const deleteItem = (id) => {
    setItems(normalized.filter((i) => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const indentItem = (id) => {
    setItems(normalized.map((i) => (i.id === id ? { ...i, indent: Math.min((i.indent || 0) + 1, 3) } : i)));
  };

  const outdentItem = (id) => {
    setItems(normalized.map((i) => (i.id === id ? { ...i, indent: Math.max((i.indent || 0) - 1, 0) } : i)));
  };

  const toggleType = (id) => {
    setItems(normalized.map((i) => (i.id === id ? { ...i, type: i.type === 'header' ? 'item' : 'header' } : i)));
  };

  const addItem = (e) => {
    e.preventDefault();
    if (!addText.trim()) return;
    setItems([...normalized, { id: genId(), text: addText.trim(), type: addType, indent: 0, done: false }]);
    setAddText('');
  };

  const insertLink = () => {
    const input = editInputRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = editText.substring(start, end);
    const url = prompt('Enter URL:', 'https://');
    if (!url) return;
    const linkText = selected || prompt('Enter link text:', '') || url;
    const markdown = `[${linkText}](${url})`;
    const newText = editText.substring(0, start) + markdown + editText.substring(end);
    setEditText(newText);
    setTimeout(() => {
      input.focus();
      const cursor = start + markdown.length;
      input.setSelectionRange(cursor, cursor);
    }, 0);
  };

  return (
    <div className="flex flex-col h-full">
      <h3 className="font-bold text-primary text-sm mb-3 shrink-0">{title}</h3>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto space-y-1 mb-3 min-h-0">
        {normalized.map((item, index) => (
          <div
            key={item.id}
            draggable={editingId !== item.id}
            onDragStart={() => { if (editingId === item.id) return; handleDragStart(index); }}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            style={{ paddingLeft: `${(item.indent || 0) * 20}px` }}
          >
            {editingId === item.id ? (
              /* ── Edit mode ── */
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 space-y-2">
                <input
                  ref={editInputRef}
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit();
                    if (e.key === 'Escape') { setEditingId(null); setEditText(''); }
                  }}
                  className="w-full rounded border border-border-default px-2 py-1.5 text-sm text-primary outline-none focus:ring-1 focus:ring-emerald-400"
                  autoFocus
                />
                <div className="flex items-center justify-between">
                  <button onClick={insertLink} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted hover:text-blue-500 hover:bg-blue-50 cursor-pointer" title="Add link">
                    <Link size={12} />
                    Link
                  </button>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingId(null); setEditText(''); }} className="px-2.5 py-1 rounded text-xs font-medium text-muted hover:bg-surface-alt cursor-pointer">
                      Cancel
                    </button>
                    <button onClick={saveEdit} className="px-2.5 py-1 rounded text-xs font-medium bg-brand text-on-brand hover:bg-brand-hover cursor-pointer">
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* ── Display mode ── */
              <div
                className={`rounded-lg p-2 transition-colors cursor-pointer ${selectedId === item.id ? 'bg-surface-alt ring-1 ring-border-strong' : 'hover:bg-surface'}`}
                onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
              >
                <div className="flex items-start gap-1.5">
                  <div className="cursor-grab text-muted hover:text-tertiary shrink-0 mt-0.5" onMouseDown={(e) => e.stopPropagation()}>
                    <GripVertical size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm break-words ${
                        item.type === 'header'
                          ? 'font-bold text-primary uppercase tracking-wide text-xs'
                          : 'text-secondary'
                      }`}
                    >
                      {item.type === 'header' && <span className="text-purple-500 mr-1 inline-block">H</span>}
                      {renderLinkedText(item.text)}
                    </div>
                  </div>
                </div>

                {/* Action bar — shown when selected */}
                {selectedId === item.id && (
                  <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border-subtle flex-wrap">
                    <button onClick={(e) => { e.stopPropagation(); outdentItem(item.id); }} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-secondary hover:bg-surface-strong cursor-pointer" title="Outdent">
                      <ChevronLeft size={12} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); indentItem(item.id); }} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-secondary hover:bg-surface-strong cursor-pointer" title="Indent">
                      <ChevronRight size={12} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); toggleType(item.id); }} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-secondary hover:text-purple-600 hover:bg-purple-50 cursor-pointer" title="Toggle header">
                      <Type size={12} />
                      {item.type === 'header' ? 'Item' : 'Header'}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); startEdit(item); }} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-secondary hover:text-blue-600 hover:bg-blue-50 cursor-pointer" title="Edit">
                      <Pencil size={12} />
                      Edit
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-secondary hover:text-red-600 hover:bg-red-50 cursor-pointer" title="Delete">
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {normalized.length === 0 && (
          <p className="text-muted text-sm py-4 text-center">No items yet. Add one below.</p>
        )}
      </div>

      {/* Add new item */}
      <form onSubmit={addItem} className="shrink-0 border-t border-border-subtle pt-3 space-y-2">
        <div className="flex gap-2">
          <select
            value={addType}
            onChange={(e) => setAddType(e.target.value)}
            className="rounded-lg border border-border-default px-2 py-2 text-xs text-secondary outline-none cursor-pointer bg-card shrink-0"
          >
            <option value="item">Item</option>
            <option value="header">Header</option>
          </select>
          <input
            type="text"
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            placeholder="Add new item..."
            className="flex-1 min-w-0 rounded-lg border border-border-default px-3 py-2 text-sm text-primary outline-none focus:ring-1 focus:ring-emerald-400"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-brand text-on-brand text-xs font-semibold hover:bg-brand-hover transition-colors cursor-pointer shrink-0"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ChecklistEditorModal({
  onClose,
  teamChecklist, setTeamChecklist,
  teamEndChecklist, setTeamEndChecklist,
  ownerStartChecklist, setOwnerStartChecklist,
  ownerEndChecklist, setOwnerEndChecklist,
}) {
  const [activeTab, setActiveTab] = useState('team');
  const [activeTime, setActiveTime] = useState('start');

  const getActiveItems = () => {
    if (activeTab === 'team' && activeTime === 'start') return teamChecklist;
    if (activeTab === 'team' && activeTime === 'end') return teamEndChecklist;
    if (activeTab === 'owner' && activeTime === 'start') return ownerStartChecklist;
    if (activeTab === 'owner' && activeTime === 'end') return ownerEndChecklist;
    return [];
  };

  const getActiveSetter = () => {
    if (activeTab === 'team' && activeTime === 'start') return setTeamChecklist;
    if (activeTab === 'team' && activeTime === 'end') return setTeamEndChecklist;
    if (activeTab === 'owner' && activeTime === 'start') return setOwnerStartChecklist;
    if (activeTab === 'owner' && activeTime === 'end') return setOwnerEndChecklist;
    return () => {};
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/50" onClick={onClose}>
      <div
        className="bg-card w-full h-full sm:m-4 sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border-subtle shrink-0">
          <h2 className="text-lg font-bold text-primary">Edit Checklists</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted hover:text-secondary hover:bg-surface-alt transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-4 sm:px-6 pt-3 pb-1 space-y-2 shrink-0">
          <div className="flex gap-1 bg-surface-alt p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('team')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'team' ? 'bg-card text-primary shadow-sm' : 'text-tertiary hover:text-secondary'
              }`}
            >
              Team
            </button>
            <button
              onClick={() => setActiveTab('owner')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'owner' ? 'bg-card text-primary shadow-sm' : 'text-tertiary hover:text-secondary'
              }`}
            >
              Owner
            </button>
          </div>
          <div className="flex gap-1 bg-surface-alt p-1 rounded-xl">
            <button
              onClick={() => setActiveTime('start')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTime === 'start' ? 'bg-card text-primary shadow-sm' : 'text-tertiary hover:text-secondary'
              }`}
            >
              Start of Day
            </button>
            <button
              onClick={() => setActiveTime('end')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTime === 'end' ? 'bg-card text-primary shadow-sm' : 'text-tertiary hover:text-secondary'
              }`}
            >
              End of Day
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 px-4 sm:px-6 py-4 flex flex-col">
          <ChecklistSection
            key={`${activeTab}-${activeTime}`}
            title={`${activeTab === 'team' ? 'Team' : 'Owner'} — ${activeTime === 'start' ? 'Start of Day' : 'End of Day'}`}
            items={getActiveItems()}
            setItems={getActiveSetter()}
          />
        </div>
      </div>
    </div>
  );
}
