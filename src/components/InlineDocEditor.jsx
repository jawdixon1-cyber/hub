import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

// Lightweight Google Docs-style inline editor for the agreement sections.
// Keeps paper styling — no toolbar chrome; you get bold (Cmd+B), italic (Cmd+I),
// headings (# ##), lists (- or 1.), etc. from StarterKit out of the box.
export default function InlineDocEditor({ content, onChange, style, className }) {
  const debounceRef = useRef(null);
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } })],
    content: content || '',
    onUpdate: ({ editor }) => {
      if (!onChange) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onChange(editor.getHTML());
      }, 200);
    },
    editorProps: {
      attributes: {
        class: 'tiptap-inline focus:outline-none',
      },
    },
  });

  // If parent changes content externally (e.g., reset), sync into editor
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (content && content !== current) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return <EditorContent editor={editor} className={className} style={style} />;
}
