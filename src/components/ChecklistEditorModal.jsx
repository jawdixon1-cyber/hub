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

// Parse markdown text into { plainText, links[] } where links have { label, url, placeholder }
function parseMarkdownLinks(text) {
  const links = [];
  let i = 0;
  const plainText = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const placeholder = `{{link${i}}}`;
    links.push({ label, url, placeholder, index: i });
    i++;
    return label;
  });
  return { plainText, links };
}

// Rebuild markdown from plain text + links array
function rebuildMarkdown(plainText, links) {
  // We need to find each link label in the plain text and wrap it back in markdown
  let result = plainText;
  // Process in reverse order so indices don't shift
  for (let i = links.length - 1; i >= 0; i--) {
    const link = links[i];
    // Find the label in the text — use the position relative to other labels
    const idx = findNthOccurrence(result, link.label, countPriorSameLabels(links, i) + 1);
    if (idx >= 0) {
      result = result.substring(0, idx) + `[${link.label}](${link.url})` + result.substring(idx + link.label.length);
    }
  }
  return result;
}

function findNthOccurrence(str, substr, n) {
  let idx = -1;
  for (let i = 0; i < n; i++) {
    idx = str.indexOf(substr, idx + 1);
    if (idx === -1) return -1;
  }
  return idx;
}

function countPriorSameLabels(links, currentIndex) {
  let count = 0;
  for (let i = 0; i < currentIndex; i++) {
    if (links[i].label === links[currentIndex].label) count++;
  }
  return count;
}

export function ChecklistSection({ title, items, setItems }) {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');  // plain text (no markdown URLs)
  const [editLinks, setEditLinks] = useState([]); // extracted links
  const [addText, setAddText] = useState('');
  const [addType, setAddType] = useState('item');
  const [selectedId, setSelectedId] = useState(null);
  const [editingLinkIdx, setEditingLinkIdx] = useState(null);
  const [dragFromIndex, setDragFromIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const editInputRef = useRef(null);

  const normalized = normalizeItems(items);

  const handleDragStart = (e, index) => {
    setDragFromIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragFromIndex === null) return;
    if (index !== dragOverIndex) setDragOverIndex(index);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (dragFromIndex === null || dragOverIndex === null) return;
    if (dragFromIndex === dragOverIndex) { setDragFromIndex(null); setDragOverIndex(null); return; }

    const updated = [...normalized];
    const [dragged] = updated.splice(dragFromIndex, 1);
    updated.splice(dragOverIndex, 0, dragged);
    setItems(updated);

    setDragFromIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragFromIndex(null);
    setDragOverIndex(null);
  };

  const startEdit = (item) => {
    const { plainText, links } = parseMarkdownLinks(item.text);
    setEditingId(item.id);
    setEditText(plainText);
    setEditLinks(links);
    setEditingLinkIdx(null);
    setSelectedId(null);
  };

  const saveEdit = () => {
    const rebuilt = rebuildMarkdown(editText.trim(), editLinks);
    if (rebuilt.trim()) {
      setItems(normalized.map((i) => (i.id === editingId ? { ...i, text: rebuilt.trim() } : i)));
    }
    setEditingId(null);
    setEditText('');
    setEditLinks([]);
    setEditingLinkIdx(null);
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
    // Insert link text into the plain text and add to links array
    const newText = editText.substring(0, start) + linkText + editText.substring(end);
    setEditText(newText);
    setEditLinks((prev) => [...prev, { label: linkText, url, index: prev.length }]);
    setTimeout(() => {
      input.focus();
      const cursor = start + linkText.length;
      input.setSelectionRange(cursor, cursor);
    }, 0);
  };

  const updateLink = (idx, field, value) => {
    setEditLinks((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      if (field === 'label') {
        // Also update the plain text
        const oldLabel = l.label;
        const occurrence = countPriorSameLabels(prev, i) + 1;
        const pos = findNthOccurrence(editText, oldLabel, occurrence);
        if (pos >= 0) {
          setEditText((t) => t.substring(0, pos) + value + t.substring(pos + oldLabel.length));
        }
      }
      return { ...l, [field]: value };
    }));
  };

  const removeLink = (idx) => {
    setEditLinks((prev) => prev.filter((_, i) => i !== idx));
    setEditingLinkIdx(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Item list */}
      <div className="flex-1 overflow-y-auto mb-4 min-h-0" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        {normalized.map((item, index) => (
          <div
            key={item.id}
            className="relative"
          >
            {/* Drop indicator line */}
            {dragOverIndex === index && dragFromIndex !== null && dragFromIndex !== index && (
              <div className="absolute top-0 left-2 right-2 z-10 flex items-center -translate-y-1/2">
                <div className="w-2.5 h-2.5 rounded-full bg-brand border-2 border-brand shrink-0" />
                <div className="flex-1 h-0.5 bg-brand rounded-full" />
                <div className="w-2.5 h-2.5 rounded-full bg-brand border-2 border-brand shrink-0" />
              </div>
            )}
            <div
              draggable={editingId !== item.id}
              onDragStart={(e) => { if (editingId === item.id) { e.preventDefault(); return; } handleDragStart(e, index); }}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              style={{ paddingLeft: `${(item.indent || 0) * 20}px` }}
              className={`py-0.5 ${dragFromIndex === index ? 'opacity-30' : ''}`}
            >
            {editingId === item.id ? (
              /* ── Edit mode ── */
              <div className="rounded-xl border border-brand/50 bg-brand-light/30 p-3 space-y-2">
                <input
                  ref={editInputRef}
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit();
                    if (e.key === 'Escape') { setEditingId(null); setEditText(''); setEditLinks([]); }
                  }}
                  className="w-full rounded-lg border border-border-default bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-brand"
                  autoFocus
                />
                {/* Link chips */}
                {editLinks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {editLinks.map((link, idx) => (
                      <div key={idx}>
                        {editingLinkIdx === idx ? (
                          <div className="flex items-center gap-1.5 bg-card border border-border-default rounded-lg p-2">
                            <input
                              type="text"
                              value={link.label}
                              onChange={(e) => updateLink(idx, 'label', e.target.value)}
                              placeholder="Label"
                              className="w-24 rounded-lg border border-border-default bg-surface-alt px-2 py-1 text-xs text-primary outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <input
                              type="text"
                              value={link.url}
                              onChange={(e) => updateLink(idx, 'url', e.target.value)}
                              placeholder="URL"
                              className="w-36 rounded-lg border border-border-default bg-surface-alt px-2 py-1 text-xs text-primary outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <button onClick={() => setEditingLinkIdx(null)} className="p-1 rounded text-muted hover:text-primary cursor-pointer">
                              <Check size={14} />
                            </button>
                            <button onClick={() => removeLink(idx)} className="p-1 rounded text-muted hover:text-red-500 cursor-pointer">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingLinkIdx(idx)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors cursor-pointer"
                            title={link.url}
                          >
                            <Link size={10} />
                            {link.label}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <button onClick={insertLink} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer" title="Add link">
                    <Link size={12} />
                    Link
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingId(null); setEditText(''); setEditLinks([]); }} className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted hover:bg-surface-alt cursor-pointer">
                      Cancel
                    </button>
                    <button onClick={saveEdit} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand text-on-brand hover:bg-brand-hover cursor-pointer">
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : item.type === 'header' ? (
              /* ── Header display ── */
              <div
                className={`rounded-xl px-3 py-2.5 transition-colors cursor-pointer ${
                  selectedId === item.id
                    ? 'bg-purple-100 dark:bg-purple-950/40 ring-1 ring-purple-300 dark:ring-purple-700'
                    : 'bg-surface-alt/60 hover:bg-surface-alt'
                } ${index > 0 ? 'mt-3' : ''}`}
                onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
              >
                <div className="flex items-center gap-2">
                  <div className="cursor-grab text-muted hover:text-secondary shrink-0 touch-none" onMouseDown={(e) => e.stopPropagation()}>
                    <GripVertical size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">
                      {renderLinkedText(item.text)}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); startEdit(item); }} className="p-1.5 rounded-lg text-muted hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer transition-colors" title="Edit">
                      <Pencil size={13} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }} className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer transition-colors" title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {selectedId === item.id && (
                  <div className="flex items-center gap-1 mt-2 pt-2 border-t border-purple-200 dark:border-purple-800/50">
                    <button onClick={(e) => { e.stopPropagation(); toggleType(item.id); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 cursor-pointer transition-colors" title="Convert to item">
                      <Type size={12} />
                      Convert to Item
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* ── Item display ── */
              <div
                className={`rounded-xl border transition-colors cursor-pointer ${
                  selectedId === item.id
                    ? 'bg-surface-alt border-border-strong ring-1 ring-brand/30'
                    : 'bg-card border-border-subtle hover:border-border-strong hover:bg-surface-alt/50'
                }`}
                onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
              >
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <div className="cursor-grab text-muted hover:text-secondary shrink-0 touch-none" onMouseDown={(e) => e.stopPropagation()}>
                    <GripVertical size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-primary break-words">
                      {renderLinkedText(item.text)}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); startEdit(item); }} className="p-1.5 rounded-lg text-muted hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer transition-colors" title="Edit">
                      <Pencil size={13} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }} className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer transition-colors" title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {selectedId === item.id && (
                  <div className="flex items-center gap-1 px-3 pb-2.5 pt-1 border-t border-border-subtle mx-3">
                    <button onClick={(e) => { e.stopPropagation(); outdentItem(item.id); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-secondary hover:bg-surface-alt cursor-pointer transition-colors" title="Outdent">
                      <ChevronLeft size={12} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); indentItem(item.id); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-secondary hover:bg-surface-alt cursor-pointer transition-colors" title="Indent">
                      <ChevronRight size={12} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); toggleType(item.id); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 cursor-pointer transition-colors" title="Make header">
                      <Type size={12} />
                      Header
                    </button>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        ))}
        {normalized.length === 0 && (
          <p className="text-muted text-sm py-8 text-center">No items yet. Add one below.</p>
        )}
      </div>

      {/* Add new item */}
      <form onSubmit={addItem} className="shrink-0 border-t border-border-subtle pt-4">
        <div className="flex gap-2">
          <select
            value={addType}
            onChange={(e) => setAddType(e.target.value)}
            className="rounded-xl border border-border-default px-3 py-2.5 text-xs font-medium text-secondary outline-none cursor-pointer bg-card shrink-0"
          >
            <option value="item">Item</option>
            <option value="header">Section</option>
          </select>
          <input
            type="text"
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            placeholder={addType === 'header' ? 'New section name...' : 'Add new item...'}
            className="flex-1 min-w-0 rounded-xl border border-border-default px-3 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-brand placeholder:text-muted"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand text-on-brand text-xs font-semibold hover:bg-brand-hover transition-colors cursor-pointer shrink-0"
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
