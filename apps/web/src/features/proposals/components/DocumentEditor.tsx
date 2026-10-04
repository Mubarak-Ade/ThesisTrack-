import { useEffect, useReducer } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * §16.4 ADR-14 editor widget: a bordered `EditorContent` under a sticky
 * toolbar carrying only what a proposal needs — bold · italic · strikethrough
 * · H2/H3 · bullet list · numbered list · blockquote · undo/redo. No image or
 * table buttons (`StarterKit` ships neither, and a figure belongs in the
 * uploaded PDF). Icons come from lucide-react, never TipTap's own.
 *
 * Content is HTML: it leaves through `onChange` for server-side sanitization
 * (§11.3) and comes back the same way. The component never parses markup.
 */

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolbarButton({ label, active, disabled, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ?? false}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault() /* keep the editor selection */}
      onClick={onClick}
      className={cn(
        'grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'bg-primary/10 text-primary',
        disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
      )}
    >
      {children}
    </button>
  );
}

function divider() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />;
}

function controls(editor: Editor | null) {
  if (!editor) return null;
  return (
    <>
      <ToolbarButton
        label="Bold"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="size-4" aria-hidden="true" />
      </ToolbarButton>
      {divider()}
      <ToolbarButton
        label="Heading 2"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 3"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="size-4" aria-hidden="true" />
      </ToolbarButton>
      {divider()}
      <ToolbarButton
        label="Bullet list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Blockquote"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="size-4" aria-hidden="true" />
      </ToolbarButton>
      {divider()}
      <ToolbarButton
        label="Undo"
        disabled={!editor.can().chain().undo().run()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="size-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        disabled={!editor.can().chain().redo().run()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="size-4" aria-hidden="true" />
      </ToolbarButton>
    </>
  );
}

interface DocumentEditorProps {
  /** Initial HTML (server-sanitized). */
  value: string;
  /** Every edit emits the current HTML for the form state. */
  onChange: (html: string) => void;
  /** Read-only proposals never render this control at all (§16.2/§11.3). */
  editable?: boolean;
  /** Accessible name for the editing region. */
  label?: string;
}

export default function DocumentEditor({
  value,
  onChange,
  editable = true,
  label = 'Proposal document',
}: DocumentEditorProps) {
  const [, rerender] = useReducer((x: number) => x + 1, 0);

  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    editable,
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  // Toolbar state (active marks, undo availability) tracks every transaction.
  useEffect(() => {
    if (!editor) return undefined;
    editor.on('transaction', rerender);
    return () => {
      editor.off('transaction', rerender);
    };
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return null;

  return (
    <div className="rounded-md border border-input">
      <div
        role="toolbar"
        aria-label={`${label} formatting`}
        className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-md border-b bg-background/95 px-2 py-1.5 backdrop-blur"
      >
        {controls(editor)}
      </div>
      <EditorContent
        editor={editor}
        aria-label={label}
        className="tiptap min-h-[220px] px-3 py-3 prose prose-sm max-w-none focus:outline-none [&_.ProseMirror]:min-h-[200px] [&_.ProseMirror]:outline-none"
      />
    </div>
  );
}
