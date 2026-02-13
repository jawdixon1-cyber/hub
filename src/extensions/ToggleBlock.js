import { Node, mergeAttributes } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

export const Details = Node.create({
  name: 'details',
  group: 'block',
  content: 'detailsSummary block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element) => element.hasAttribute('open'),
        renderHTML: (attributes) => (attributes.open ? { open: '' } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'details' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['details', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertToggle:
        () =>
        ({ state, tr, dispatch }) => {
          const { $from } = state.selection;
          const detailsType = state.schema.nodes.details;
          const summaryType = state.schema.nodes.detailsSummary;
          const paragraphType = state.schema.nodes.paragraph;

          const node = detailsType.create({ open: true }, [
            summaryType.create(),
            paragraphType.create(),
          ]);

          const isEmptyParagraph =
            $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0;

          let insertPos;
          if (isEmptyParagraph) {
            const start = $from.before($from.depth);
            const end = $from.after($from.depth);
            tr.replaceWith(start, end, node);
            insertPos = start;
          } else {
            insertPos = $from.after($from.depth);
            tr.insert(insertPos, node);
          }

          // Place cursor inside the empty summary
          tr.setSelection(TextSelection.create(tr.doc, insertPos + 2));

          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Exit toggle: Enter on empty last paragraph inside details
      Enter: ({ editor }) => {
        const { state } = editor;
        const { $from } = state.selection;

        if ($from.parent.type.name !== 'paragraph') return false;
        if ($from.parent.content.size !== 0) return false;

        for (let d = $from.depth - 1; d >= 0; d--) {
          if ($from.node(d).type.name === 'details') {
            // Only exit if this is the last child
            if ($from.index(d) !== $from.node(d).childCount - 1) break;

            const detailsNode = $from.node(d);
            const tr = state.tr;

            // Only delete the empty paragraph if the toggle would still
            // satisfy its schema (detailsSummary block+), i.e. > 2 children
            if (detailsNode.childCount > 2) {
              tr.delete($from.before($from.depth), $from.after($from.depth));
            }

            // Insert a paragraph after the toggle and move cursor there
            const afterDetails = tr.mapping.map($from.after(d));
            tr.insert(afterDetails, state.schema.nodes.paragraph.create());
            tr.setSelection(TextSelection.create(tr.doc, afterDetails + 1));
            editor.view.dispatch(tr);
            return true;
          }
        }
        return false;
      },
    };
  },
});

export const DetailsSummary = Node.create({
  name: 'detailsSummary',
  content: 'inline*',
  defining: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'summary' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['summary', mergeAttributes(HTMLAttributes), 0];
  },

  addKeyboardShortcuts() {
    return {
      // Enter in summary → expand if collapsed, then move cursor to content area
      Enter: ({ editor }) => {
        const { state } = editor;
        const { $from } = state.selection;

        if ($from.parent.type.name !== 'detailsSummary') return false;

        const afterSummary = $from.after();
        const tr = state.tr;

        // If parent details is collapsed, expand it first
        for (let d = $from.depth - 1; d >= 0; d--) {
          if ($from.node(d).type.name === 'details') {
            if (!$from.node(d).attrs.open) {
              tr.setNodeMarkup($from.before(d), null, { ...$from.node(d).attrs, open: true });
            }
            break;
          }
        }

        tr.setSelection(TextSelection.create(tr.doc, afterSummary + 1));
        editor.view.dispatch(tr);
        return true;
      },
    };
  },
});

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '' }), 0];
  },

  addCommands() {
    return {
      insertCallout:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            content: [{ type: 'paragraph' }],
          });
        },
    };
  },
});

export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      src: { default: '' },
    };
  },

  parseHTML() {
    return [{
      tag: 'div[data-embed]',
      getAttrs: (node) => ({
        src: node.querySelector('iframe')?.getAttribute('src') || '',
      }),
    }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { 'data-embed': '' },
      [
        'iframe',
        {
          src: HTMLAttributes.src,
          frameborder: '0',
          allowfullscreen: 'true',
          allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
        },
      ],
    ];
  },

  addCommands() {
    return {
      insertEmbed:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});
