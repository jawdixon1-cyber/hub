import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
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
} from 'lucide-react';

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
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-blue-600 underline hover:text-blue-800 cursor-pointer' } }),
      Placeholder.configure({ placeholder: 'Start writing your guide...' }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
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
        className="prose prose-sm max-w-none px-4 py-3 min-h-[300px] focus:outline-none [&_.tiptap]:outline-none [&_.tiptap]:min-h-[280px] [&_p]:my-1 [&_h1]:mt-4 [&_h1]:mb-1 [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_img]:rounded-lg [&_img]:max-h-64 [&_img]:object-cover [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:h-0"
      />
    </div>
  );
}
