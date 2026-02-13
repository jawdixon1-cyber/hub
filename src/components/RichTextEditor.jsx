import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ImagePlus,
  Link as LinkIcon,
  Undo,
  Redo,
  IndentIncrease,
  IndentDecrease,
  Lightbulb,
  ChevronRight,
  Minus,
  Type,
  Info,
  Video,
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

function ToolbarButton({ onClick, active, children, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active ? 'bg-brand-light text-brand-text-strong' : 'text-tertiary hover:bg-surface-alt hover:text-secondary'
      }`}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({ content, onChange }) {
  const menuRef = useRef(null);
  const editorRef = useRef(null);
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
      StarterKit,
      Image,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer' } }),
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

        e.preventDefault(); // prevent native <details> toggle

        const clickX = e.clientX - summary.getBoundingClientRect().left;
        if (clickX > 32) return; // text zone – just prevent toggle

        // Arrow zone – toggle via ProseMirror
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

  const handleLink = () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = prompt('Enter URL:', 'https://');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const handleImageUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        compressImage(file).then((src) => {
          editor.chain().focus().setImage({ src }).run();
        });
      }
    };
    input.click();
  };

  const filteredCommands = slashMenu ? getFilteredCommands(slashMenu.query) : [];

  return (
    <div className="border border-border-strong rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-ring-brand focus-within:border-border-brand transition">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border-default bg-surface flex-wrap">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <Heading1 size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <Heading3 size={16} />
        </ToolbarButton>
        <div className="w-px h-5 bg-surface-strong mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold"
        >
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic"
        >
          <Italic size={16} />
        </ToolbarButton>
        <div className="w-px h-5 bg-surface-strong mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          active={editor.isActive('highlight')}
          title="Highlight as Why"
        >
          <Lightbulb size={16} />
        </ToolbarButton>
        <div className="w-px h-5 bg-surface-strong mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <List size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Numbered List"
        >
          <ListOrdered size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
          title="Indent (nest)"
        >
          <IndentIncrease size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().liftListItem('listItem').run()}
          title="Outdent (un-nest)"
        >
          <IndentDecrease size={16} />
        </ToolbarButton>
        <div className="w-px h-5 bg-surface-strong mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().insertToggle().run()}
          active={editor.isActive('details')}
          title="Toggle Block"
        >
          <ChevronRight size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().insertCallout().run()}
          active={editor.isActive('callout')}
          title="Callout"
        >
          <Info size={16} />
        </ToolbarButton>
        <div className="w-px h-5 bg-surface-strong mx-1" />
        <ToolbarButton onClick={handleLink} active={editor.isActive('link')} title="Add Link">
          <LinkIcon size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={handleImageUpload} title="Insert Image">
          <ImagePlus size={16} />
        </ToolbarButton>
        <div className="w-px h-5 bg-surface-strong mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          title="Undo"
        >
          <Undo size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          title="Redo"
        >
          <Redo size={16} />
        </ToolbarButton>
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm dark:prose-invert max-w-none px-4 py-3 min-h-[300px] focus:outline-none [&_.tiptap]:outline-none [&_.tiptap]:min-h-[280px] [&_p]:my-1 [&_h1]:mt-4 [&_h1]:mb-1 [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_img]:rounded-lg [&_img]:max-h-64 [&_img]:object-cover [&_.why-mark]:bg-yellow-100 dark:[&_.why-mark]:bg-yellow-900/40 [&_.why-mark]:px-0.5 [&_.why-mark]:rounded [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:h-0"
      />

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
