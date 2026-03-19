import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ImagePlus,
  Link as LinkIcon,
  Lightbulb,
  ChevronRight,
  Minus,
  Type,
  Info,
  Video,
  GripVertical,
  MoreHorizontal,
  Trash2,
  Palette,
  ArrowRightLeft,
} from 'lucide-react';
import { Details, DetailsSummary, Callout, Embed } from '../extensions/ToggleBlock';

const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.8;

function compressImage(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round(height * (MAX_DIMENSION / width));
          width = MAX_DIMENSION;
        } else {
          width = Math.round(width * (MAX_DIMENSION / height));
          height = MAX_DIMENSION;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.src = url;
  });
}

/* ── Slash commands ── */
const SLASH_COMMANDS = [
  {
    label: 'Heading 1',
    aliases: ['h1', 'head1', 'heading1'],
    icon: Heading1,
    description: 'Large section heading',
    action: (ed) => ed.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    label: 'Heading 2',
    aliases: ['h2', 'head2', 'heading2'],
    icon: Heading2,
    description: 'Medium section heading',
    action: (ed) => ed.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: 'Heading 3',
    aliases: ['h3', 'head3', 'heading3'],
    icon: Heading3,
    description: 'Small section heading',
    action: (ed) => ed.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: 'Toggle Block',
    aliases: ['toggle', 'tog', 'collapsible'],
    icon: ChevronRight,
    description: 'Collapsible section',
    action: (ed) => ed.chain().focus().insertToggle().run(),
  },
  {
    label: 'Bullet List',
    aliases: ['bullet', 'list', 'ul'],
    icon: List,
    description: 'Simple bullet list',
    action: (ed) => ed.chain().focus().toggleBulletList().run(),
  },
  {
    label: 'Numbered List',
    aliases: ['number', 'numbered', 'ol', 'ordered'],
    icon: ListOrdered,
    description: 'Numbered list',
    action: (ed) => ed.chain().focus().toggleOrderedList().run(),
  },
  {
    label: 'Callout',
    aliases: ['callout', 'info', 'tip', 'note', 'warning'],
    icon: Info,
    description: 'Highlighted info box',
    action: (ed) => ed.chain().focus().insertCallout().run(),
  },
  {
    label: 'Highlight (Why)',
    aliases: ['highlight', 'why', 'mark'],
    icon: Lightbulb,
    description: 'Highlight the "why"',
    action: (ed) => ed.chain().focus().toggleHighlight().run(),
  },
  {
    label: 'Image',
    aliases: ['image', 'img', 'photo'],
    icon: ImagePlus,
    description: 'Upload an image',
    action: (ed) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          compressImage(file).then((src) => {
            ed.chain().focus().setImage({ src }).run();
          });
        }
      };
      input.click();
    },
  },
  {
    label: 'Embed',
    aliases: ['embed', 'video', 'youtube', 'iframe'],
    icon: Video,
    description: 'Embed a video or URL',
    action: (ed) => {
      const url = prompt('Enter embed URL (YouTube, etc.):');
      if (!url) return;
      let embedUrl = url;
      const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
      if (ytMatch) embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
      ed.chain().focus().insertEmbed({ src: embedUrl }).run();
    },
  },
  {
    label: 'Divider',
    aliases: ['divider', 'hr', 'line', 'separator'],
    icon: Minus,
    description: 'Horizontal divider',
    action: (ed) => ed.chain().focus().setHorizontalRule().run(),
  },
  {
    label: 'Text',
    aliases: ['text', 'paragraph', 'p', 'plain'],
    icon: Type,
    description: 'Plain text paragraph',
    action: (ed) => ed.chain().focus().setParagraph().run(),
  },
];

function getFilteredCommands(query) {
  if (!query) return SLASH_COMMANDS;
  const q = query.toLowerCase();
  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.aliases.some((a) => a.startsWith(q))
  );
}

/* ── Bubble Menu helpers ── */
const TEXT_COLORS = [
  { label: 'Default', value: null },
  { label: 'Red', value: '#ef4444' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Yellow', value: '#eab308' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Pink', value: '#ec4899' },
  { label: 'Gray', value: '#6b7280' },
];

const TURN_INTO_OPTIONS = [
  { label: 'Text', icon: Type, action: (ed) => ed.chain().focus().setParagraph().run() },
  { label: 'Heading 1', icon: Heading1, action: (ed) => ed.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: 'Heading 2', icon: Heading2, action: (ed) => ed.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'Heading 3', icon: Heading3, action: (ed) => ed.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: 'Bullet list', icon: List, action: (ed) => ed.chain().focus().toggleBulletList().run() },
  { label: 'Numbered list', icon: ListOrdered, action: (ed) => ed.chain().focus().toggleOrderedList().run() },
  { label: 'Toggle', icon: ChevronRight, action: (ed) => ed.chain().focus().insertToggle().run() },
  { label: 'Callout', icon: Info, action: (ed) => ed.chain().focus().insertCallout().run() },
];

function BubbleBtn({ onClick, active, children, title }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

function SelectionToolbar({ editor }) {
  const [pos, setPos] = useState(null);
  const [subMenu, setSubMenu] = useState(null);
  const toolbarRef = useRef(null);

  useEffect(() => {
    if (!editor) return;

    const update = () => {
      const { empty } = editor.state.selection;
      if (empty) { setPos(null); setSubMenu(null); return; }
      // Use native selection range for reliable multi-line positioning
      const domSel = window.getSelection();
      if (!domSel || domSel.rangeCount === 0) { setPos(null); return; }
      const range = domSel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) { setPos(null); return; }
      setPos({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      });
    };

    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    const onBlur = () => { setTimeout(() => { setPos(null); setSubMenu(null); }, 200); };
    editor.on('blur', onBlur);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
      editor.off('blur', onBlur);
    };
  }, [editor]);

  if (!pos) return null;

  const handleLink = () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = prompt('Enter URL:', 'https://');
    if (url) editor.chain().focus().setLink({ href: url }).run();
  };

  const deleteBlock = () => {
    editor.chain().focus().deleteSelection().run();
    setPos(null);
    setSubMenu(null);
  };

  return (
    <div
      ref={toolbarRef}
      className="fixed z-[200]"
      style={{ top: pos.top, left: pos.left, transform: 'translate(-50%, -100%)' }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="relative">
        <div className="flex items-center gap-0.5 bg-gray-900 rounded-lg px-1 py-0.5 shadow-xl border border-white/10">
          <BubbleBtn onClick={() => setSubMenu(subMenu === 'turnInto' ? null : 'turnInto')} active={subMenu === 'turnInto'} title="Turn into">
            <Type size={15} />
          </BubbleBtn>
          <div className="w-px h-4 bg-white/20 mx-0.5" />
          <BubbleBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
            <BoldIcon size={15} strokeWidth={2.5} />
          </BubbleBtn>
          <BubbleBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
            <ItalicIcon size={15} />
          </BubbleBtn>
          <BubbleBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
            <UnderlineIcon size={15} />
          </BubbleBtn>
          <BubbleBtn onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="Highlight">
            <Lightbulb size={15} />
          </BubbleBtn>
          <div className="w-px h-4 bg-white/20 mx-0.5" />
          <BubbleBtn onClick={handleLink} active={editor.isActive('link')} title="Link">
            <LinkIcon size={15} />
          </BubbleBtn>
          <div className="w-px h-4 bg-white/20 mx-0.5" />
          <BubbleBtn onClick={() => setSubMenu(subMenu === 'more' ? null : 'more')} active={subMenu === 'more'} title="More options">
            <MoreHorizontal size={15} />
          </BubbleBtn>
        </div>

        {subMenu === 'more' && (
          <div className="absolute top-full right-0 mt-1 bg-gray-900 rounded-lg shadow-xl border border-white/10 py-1 w-44 z-50">
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setSubMenu('color'); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors text-left"
            >
              <Palette size={14} /> Color
              <ChevronRight size={12} className="ml-auto opacity-50" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); deleteBlock(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors text-left"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )}

        {subMenu === 'turnInto' && (
          <div className="absolute top-full left-0 mt-1 bg-gray-900 rounded-lg shadow-xl border border-white/10 py-1 w-48 z-50 max-h-72 overflow-y-auto">
            {TURN_INTO_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); opt.action(editor); setSubMenu(null); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors text-left"
              >
                <opt.icon size={15} className="opacity-60" /> {opt.label}
              </button>
            ))}
          </div>
        )}

        {subMenu === 'color' && (
          <div className="absolute top-full right-0 mt-1 bg-gray-900 rounded-lg shadow-xl border border-white/10 py-1 w-44 z-50">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.label}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (c.value) editor.chain().focus().setColor(c.value).run();
                  else editor.chain().focus().unsetColor().run();
                  setSubMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors text-left"
              >
                <span
                  className="w-4 h-4 rounded-full border border-white/20 shrink-0"
                  style={{ backgroundColor: c.value || 'transparent' }}
                />
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Block handle helpers ── */

// Block-level tags we can target for moving
const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'DETAILS', 'UL', 'OL', 'BLOCKQUOTE', 'HR', 'DIV', 'IMG']);

// Find the nearest moveable block DOM element from a target
function findMoveableBlock(target, editorDOM) {
  let el = target;
  if (!el || el === editorDOM) return null;

  // Walk up to find a block-level element
  while (el && el !== editorDOM) {
    const tag = el.tagName;
    // Skip summary (part of details) and inline elements
    if (tag === 'SUMMARY') { el = el.parentElement; continue; }

    if (BLOCK_TAGS.has(tag)) {
      // For LI: target the LI itself
      // For DIV with data-callout or data-embed: target the div
      // For P/H1-H6: target the element
      // For UL/OL: only target if it's a direct child of the editor (top-level list)
      //   otherwise skip it and let the LI inside be targeted
      if ((tag === 'UL' || tag === 'OL') && el.parentElement !== editorDOM) {
        el = el.parentElement;
        continue;
      }
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

// Get the ProseMirror node info for a DOM element
function getBlockInfo(editor, domEl) {
  try {
    const pos = editor.view.posAtDOM(domEl, 0);
    const $pos = editor.state.doc.resolve(pos);

    // Find the depth of this block — we want the node that corresponds to the DOM element
    for (let d = $pos.depth; d >= 1; d--) {
      const node = $pos.node(d);
      const parent = $pos.node(d - 1);
      const nodePos = $pos.before(d);
      const index = $pos.index(d - 1);
      const siblingCount = parent.childCount;

      // Match: the node type should correspond to the DOM tag
      const name = node.type.name;
      const tag = domEl.tagName;

      const match =
        (tag === 'LI' && name === 'listItem') ||
        (tag === 'P' && name === 'paragraph') ||
        (tag === 'DETAILS' && name === 'details') ||
        (tag === 'DIV' && (name === 'callout' || name === 'embed')) ||
        (tag === 'HR' && name === 'horizontalRule') ||
        (tag === 'IMG' && name === 'image') ||
        ((tag === 'UL' || tag === 'OL') && (name === 'bulletList' || name === 'orderedList')) ||
        (tag.match(/^H[1-6]$/) && name === 'heading');

      if (match) {
        return { node, nodePos, index, siblingCount, parentPos: d > 1 ? $pos.before(d - 1) : 0, depth: d };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function moveNode(editor, info, direction) {
  const { nodePos, node, index, siblingCount, depth } = info;
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= siblingCount) return;

  const { state } = editor;
  const tr = state.tr;
  const $pos = state.doc.resolve(nodePos);
  const parent = $pos.node(depth - 1);

  // For list items, skip the first child if it's a detailsSummary
  // Calculate sibling positions
  let parentStart = depth > 1 ? $pos.before(depth - 1) + 1 : 0;
  let positions = [];
  let offset = parentStart;
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    positions.push({ start: offset, end: offset + child.nodeSize, node: child });
    offset += child.nodeSize;
  }

  const from = positions[index];
  const to = positions[targetIndex];

  if (direction === -1) {
    // Moving up: place before the target
    const slice = state.doc.slice(from.start, from.end);
    tr.delete(from.start, from.end);
    tr.insert(tr.mapping.map(to.start), slice.content);
  } else {
    // Moving down: place after the target
    const slice = state.doc.slice(from.start, from.end);
    tr.insert(tr.mapping.map(to.end), slice.content);
    tr.delete(tr.mapping.map(from.start), tr.mapping.map(from.end));
  }

  editor.view.dispatch(tr);
}

function deleteNode(editor, info) {
  const { nodePos, node, siblingCount } = info;
  if (siblingCount <= 1) return; // Don't delete last sibling
  const tr = editor.state.tr;
  tr.delete(nodePos, nodePos + node.nodeSize);
  editor.view.dispatch(tr);
}

/* ── Block Handle Component ── */
function BlockHandle({ editor, wrapperRef }) {
  const [handle, setHandle] = useState(null);
  const hideTimeout = useRef(null);
  const handleRef = useRef(null);
  const blockInfoRef = useRef(null);
  const hoveredElRef = useRef(null);
  const dragInfoRef = useRef(null);
  const dropLineRef = useRef(null);

  const showHandle = useCallback((e) => {
    // Don't interfere while user is selecting text (mouse button held)
    if (e.buttons !== 0) return;
    if (!editor || !wrapperRef.current) return;
    const editorDOM = editor.view.dom;
    if (!editorDOM) return;
    if (handleRef.current?.contains(e.target)) return;

    const el = findMoveableBlock(e.target, editorDOM);
    if (!el) return;

    if (el === hoveredElRef.current) return;
    hoveredElRef.current = el;

    clearTimeout(hideTimeout.current);

    const info = getBlockInfo(editor, el);
    if (!info) return;

    blockInfoRef.current = info;

    const wrapperRect = wrapperRef.current.getBoundingClientRect();
    const blockRect = el.getBoundingClientRect();

    setHandle({
      top: blockRect.top - wrapperRect.top,
      height: blockRect.height,
    });
  }, [editor, wrapperRef]);

  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => {
      setHandle(null);
      hoveredElRef.current = null;
      blockInfoRef.current = null;
    }, 300);
  }, []);

  const cancelHide = useCallback(() => {
    clearTimeout(hideTimeout.current);
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    wrapper.addEventListener('mousemove', showHandle);
    wrapper.addEventListener('mouseleave', scheduleHide);
    return () => {
      wrapper.removeEventListener('mousemove', showHandle);
      wrapper.removeEventListener('mouseleave', scheduleHide);
      clearTimeout(hideTimeout.current);
    };
  }, [showHandle, scheduleHide, wrapperRef]);

  // Drag-and-drop: listeners attached to document only while dragging
  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!editor || !wrapperRef.current) return;
    const editorDOM = editor.view.dom;
    const el = findMoveableBlock(e.target, editorDOM);
    if (!el) return;

    const wrapperRect = wrapperRef.current.getBoundingClientRect();
    const blockRect = el.getBoundingClientRect();
    const midY = blockRect.top + blockRect.height / 2;
    const above = e.clientY < midY;
    const lineY = above
      ? blockRect.top - wrapperRect.top
      : blockRect.bottom - wrapperRect.top;

    if (dropLineRef.current) {
      dropLineRef.current.style.top = `${lineY}px`;
      dropLineRef.current.style.display = 'block';
    }
  }, [editor, wrapperRef]);

  const cleanupDrag = useCallback(() => {
    if (dropLineRef.current) dropLineRef.current.style.display = 'none';
    dragInfoRef.current = null;
    document.removeEventListener('dragover', onDragOver);
    document.removeEventListener('drop', onDrop);
    document.removeEventListener('dragend', cleanupDrag);
  }, [onDragOver]);

  const onDrop = useCallback((e) => {
    const srcInfo = dragInfoRef.current;
    if (!srcInfo || !editor) { cleanupDrag(); return; }

    e.preventDefault();
    cleanupDrag();

    const editorDOM = editor.view.dom;
    const el = findMoveableBlock(e.target, editorDOM);
    if (!el) return;
    const destInfo = getBlockInfo(editor, el);
    if (!destInfo) return;

    const blockRect = el.getBoundingClientRect();
    const above = e.clientY < blockRect.top + blockRect.height / 2;

    const { state } = editor;
    const { tr } = state;
    const srcNode = srcInfo.node;
    const srcPos = srcInfo.nodePos;
    const srcSize = srcNode.nodeSize;

    let destPos = above ? destInfo.nodePos : destInfo.nodePos + destInfo.node.nodeSize;

    if (srcPos === destInfo.nodePos) return;
    if (srcInfo.parentPos !== destInfo.parentPos) return;

    if (srcPos < destPos) {
      tr.delete(srcPos, srcPos + srcSize);
      destPos -= srcSize;
      tr.insert(destPos, srcNode);
    } else {
      tr.insert(destPos, srcNode);
      tr.delete(srcPos + srcSize, srcPos + srcSize + srcSize);
    }

    editor.view.dispatch(tr);
    hoveredElRef.current = null;
    setHandle(null);
  }, [editor, cleanupDrag]);

  const handleDragStart = useCallback((e) => {
    const info = blockInfoRef.current;
    if (!info) { e.preventDefault(); return; }
    dragInfoRef.current = info;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    // Ghost image
    const el = hoveredElRef.current;
    if (el) {
      const ghost = el.cloneNode(true);
      ghost.style.cssText = 'position:fixed;top:-9999px;opacity:0.7;pointer-events:none;max-width:400px;';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 0);
      requestAnimationFrame(() => ghost.remove());
    }
    // Attach listeners only now
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    document.addEventListener('dragend', cleanupDrag);
  }, [onDragOver, onDrop, cleanupDrag]);

  if (!handle) return null;

  const centeredTop = handle.top + Math.max(0, (handle.height - 24) / 2);

  return (
    <>
      {/* Drop indicator line */}
      <div
        ref={dropLineRef}
        className="absolute left-6 right-0 h-0.5 bg-brand rounded-full pointer-events-none z-50"
        style={{ display: 'none', top: 0 }}
      />
      <div
        ref={handleRef}
        className="absolute left-0.5 z-40 cursor-grab active:cursor-grabbing"
        style={{ top: centeredTop }}
        draggable
        data-grip="true"
        onDragStart={handleDragStart}
        onMouseEnter={cancelHide}
        onMouseLeave={scheduleHide}
        title="Drag to move"
      >
        <div data-grip="true" className="p-1.5 rounded hover:bg-surface-alt transition-colors text-muted/30 hover:text-muted/70">
          <GripVertical size={20} />
        </div>
      </div>
    </>
  );
}

export default function RichTextEditor({ content, onChange }) {
  const menuRef = useRef(null);
  const editorRef = useRef(null);
  const wrapperRef = useRef(null);
  const [slashMenu, setSlashMenu] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Synchronous ref so handleKeyDown always has latest state
  const slashRef = useRef({ menu: null, index: 0 });

  // Scroll selected menu item into view
  useEffect(() => {
    if (menuRef.current && slashMenu) {
      const item = menuRef.current.children[selectedIndex];
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, slashMenu]);

  const detectSlashCommand = useCallback((editor) => {
    const { state } = editor;
    const { from, empty } = state.selection;
    if (!empty) {
      slashRef.current = { menu: null, index: 0 };
      setSlashMenu(null);
      return;
    }

    const $from = state.selection.$from;
    const textInBlock = $from.parent.textContent.slice(0, $from.parentOffset);
    const match = textInBlock.match(/(?:^|\s)\/(\w*)$/);

    if (match) {
      const filtered = getFilteredCommands(match[1]);
      if (filtered.length > 0) {
        const coords = editor.view.coordsAtPos(from);
        // Position above if not enough room below
        const spaceBelow = window.innerHeight - coords.bottom;
        const top = spaceBelow > 300 ? coords.bottom + 4 : coords.top - 280;
        const menu = {
          query: match[1],
          from: from - match[1].length - 1,
          to: from,
          top,
          left: Math.min(coords.left, window.innerWidth - 240),
        };
        // Update ref synchronously so handleKeyDown sees it immediately
        slashRef.current = { menu, index: 0 };
        setSlashMenu(menu);
        setSelectedIndex(0);
        return;
      }
    }
    slashRef.current = { menu: null, index: 0 };
    setSlashMenu(null);
  }, []);

  const executeSlashCommand = useCallback((cmd) => {
    const ed = editorRef.current;
    const { menu } = slashRef.current;
    if (!ed || !menu) return;
    ed.chain().focus().deleteRange({ from: menu.from, to: menu.to }).run();
    cmd.action(ed);
    slashRef.current = { menu: null, index: 0 };
    setSlashMenu(null);
  }, []);

  // Slash-command key handling as a high-priority TipTap extension so it
  // reliably fires before other Enter handlers (toggle-block exit, etc.).
  const slashExtension = useMemo(() => Extension.create({
    name: 'slashCommands',
    priority: 1000,
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          const { menu, index } = slashRef.current;
          if (!menu) return false;
          const filtered = getFilteredCommands(menu.query);
          if (!filtered.length) return false;
          executeSlashCommand(filtered[index]);
          return true;
        },
        ArrowDown: () => {
          const { menu, index } = slashRef.current;
          if (!menu) return false;
          const filtered = getFilteredCommands(menu.query);
          if (!filtered.length) return false;
          const next = (index + 1) % filtered.length;
          slashRef.current = { ...slashRef.current, index: next };
          setSelectedIndex(next);
          return true;
        },
        ArrowUp: () => {
          const { menu, index } = slashRef.current;
          if (!menu) return false;
          const filtered = getFilteredCommands(menu.query);
          if (!filtered.length) return false;
          const next = (index - 1 + filtered.length) % filtered.length;
          slashRef.current = { ...slashRef.current, index: next };
          setSelectedIndex(next);
          return true;
        },
        Escape: () => {
          if (!slashRef.current.menu) return false;
          slashRef.current = { menu: null, index: 0 };
          setSlashMenu(null);
          return true;
        },
      };
    },
  }), [executeSlashCommand]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ dropcursor: false }),
      Image,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer' } }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ HTMLAttributes: { class: 'why-mark' } }),
      Placeholder.configure({ placeholder: 'Start writing your guide... (type / for commands)' }),
      Details,
      DetailsSummary,
      Callout,
      Embed,
      slashExtension,
    ],
    content: content || '',
    onCreate: ({ editor }) => {
      editorRef.current = editor;
      // Capture-phase click prevents native <details> toggle on all summary clicks.
      // Arrow zone (left 32px): toggle open/closed via ProseMirror transaction.
      // Text zone: no-op – editor handles text selection normally.
      editor.view.dom.addEventListener('click', (e) => {
        const summary = e.target.closest('summary');
        if (!summary || !editor.view.dom.contains(summary)) return;
        const details = summary.closest('details');
        if (!details) return;

        const clickX = e.clientX - summary.getBoundingClientRect().left;
        if (clickX > 32) {
          // Text zone – just prevent the native toggle, don't block anything else
          e.preventDefault();
          return;
        }

        // Arrow zone – prevent toggle and do it via ProseMirror
        e.preventDefault();
        try {
          const pos = editor.view.posAtDOM(summary, 0);
          const $pos = editor.state.doc.resolve(pos);
          for (let d = $pos.depth; d >= 0; d--) {
            if ($pos.node(d).type.name === 'details') {
              const nodePos = $pos.before(d);
              const node = $pos.node(d);
              editor.view.dispatch(
                editor.state.tr.setNodeMarkup(nodePos, null, {
                  ...node.attrs,
                  open: !node.attrs.open,
                })
              );
              break;
            }
          }
        } catch (_) {}
      }, true); // capture phase – fires before native toggle
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      detectSlashCommand(editor);
    },
    onSelectionUpdate: ({ editor }) => {
      detectSlashCommand(editor);
    },
    onBlur: () => {
      // Delay so menu clicks can process before menu disappears
      setTimeout(() => {
        slashRef.current = { menu: null, index: 0 };
        setSlashMenu(null);
      }, 150);
    },
    editorProps: {
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              compressImage(file).then((src) => {
                view.dispatch(
                  view.state.tr.replaceSelectionWith(
                    view.state.schema.nodes.image.create({ src })
                  )
                );
              });
            }
            return true;
          }
        }
        return false;
      },
    },
  });

  useEffect(() => { editorRef.current = editor; }, [editor]);

  if (!editor) return null;

  const filteredCommands = slashMenu ? getFilteredCommands(slashMenu.query) : [];

  return (
    <div>
      {/* Floating selection toolbar */}
      <SelectionToolbar editor={editor} />

      <div ref={wrapperRef} className="relative pl-7">
        <BlockHandle editor={editor} wrapperRef={wrapperRef} />
        <EditorContent
          editor={editor}
          className="prose prose-sm prose-neutral dark:prose-invert max-w-none px-2 min-h-[200px] focus:outline-none [&_.tiptap]:outline-none [&_.tiptap]:min-h-[180px] [&_p]:my-1 [&_p]:text-primary [&_h1]:mt-4 [&_h1]:mb-1 [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_li]:text-primary [&_img]:rounded-lg [&_img]:max-h-64 [&_img]:object-cover [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_a]:underline [&_.why-mark]:bg-yellow-100 dark:[&_.why-mark]:bg-yellow-900/40 [&_.why-mark]:px-0.5 [&_.why-mark]:rounded [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:h-0"
        />
      </div>

      {/* Slash command menu – fixed so it escapes overflow-hidden parents */}
      {slashMenu && filteredCommands.length > 0 && (
        <div
          ref={menuRef}
          className="fixed z-[100] bg-card border border-border-default rounded-lg shadow-xl py-1 w-56 max-h-64 overflow-y-auto"
          style={{ top: slashMenu.top, left: slashMenu.left }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {filteredCommands.map((cmd, i) => (
            <button
              key={cmd.label}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                executeSlashCommand(cmd);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors ${
                i === selectedIndex
                  ? 'bg-brand-light text-brand-text-strong'
                  : 'text-primary hover:bg-surface-alt'
              }`}
            >
              <cmd.icon size={16} className="shrink-0 opacity-60" />
              <div className="flex flex-col min-w-0">
                <span className="font-medium truncate">{cmd.label}</span>
                <span className="text-xs opacity-50 truncate">{cmd.description}</span>
              </div>
              <span className="ml-auto text-xs opacity-40 shrink-0">/{cmd.aliases[0]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
