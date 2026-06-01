"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Eraser,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
  Unlink,
  Check,
  X,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { LucideIcon } from "lucide-react";

interface SupportRichTextEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeightClassName?: string;
}

// ─── Design tokens ────────────────────────────────────────────────
const ACCENT = "#0095FF";
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

// ─── Toolbar button ───────────────────────────────────────────────

function ToolbarBtn({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-7 w-7 items-center justify-center rounded-[4px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0095FF]/50 disabled:opacity-30 disabled:cursor-not-allowed ${
        active
          ? "bg-[#0095FF]/20 text-[#33adff]"
          : "text-white/55 hover:bg-white/[0.07] hover:text-white/90"
      }`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
    </button>
  );
}

function ToolbarSeparator() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-white/[0.1]" />;
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

// ─── Link popover ────────────────────────────────────────────────

function LinkPopover({
  editor,
  open,
  onClose,
}: {
  editor: Editor;
  open: boolean;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Pre-fill when popover opens
  useEffect(() => {
    if (!open) return;
    const existing = editor.getAttributes("link").href as string | undefined;
    setUrl(existing || "https://");
    setTimeout(() => inputRef.current?.select(), 0);
  }, [open, editor]);

  const apply = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed || trimmed === "https://") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: trimmed })
        .run();
    }
    onClose();
  }, [editor, url, onClose]);

  const remove = useCallback(() => {
    editor.chain().focus().unsetLink().run();
    onClose();
  }, [editor, onClose]);

  if (!open) return null;

  return (
    // Positioned absolutely below the toolbar
    <div
      role="dialog"
      aria-label="Insert link"
      className="absolute left-0 top-full z-50 mt-1 w-full border border-white/[0.1] bg-[#111216] rounded-[6px] shadow-xl shadow-black/40 px-3 py-2.5 flex items-center gap-2"
    >
      <Link2 className="h-3.5 w-3.5 shrink-0 text-white/40" />
      <input
        ref={inputRef}
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); apply(); }
          if (e.key === "Escape") { e.preventDefault(); onClose(); }
        }}
        placeholder="https://example.com"
        className={`${MONO} flex-1 bg-transparent text-[12px] text-white placeholder:text-white/30 outline-none`}
        spellCheck={false}
        autoComplete="off"
      />
      {editor.isActive("link") && (
        <button
          type="button"
          title="Remove link"
          onClick={remove}
          className="shrink-0 inline-flex h-6 items-center gap-1 px-2 rounded-[4px] border border-white/[0.08] text-[10px] uppercase tracking-wider text-rose-300/80 hover:text-rose-200 hover:bg-rose-500/10 transition-colors"
        >
          <Unlink className="h-3 w-3" />
          Remove
        </button>
      )}
      <button
        type="button"
        title="Cancel"
        onClick={onClose}
        className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-[4px] text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Apply link"
        onClick={apply}
        className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-[4px] transition-colors"
        style={{ background: `${ACCENT}22`, color: ACCENT }}
      >
        <Check className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Full toolbar ─────────────────────────────────────────────────

function EditorToolbar({
  editor,
  linkOpen,
  onLinkToggle,
}: {
  editor: Editor;
  linkOpen: boolean;
  onLinkToggle: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className="flex flex-wrap items-center gap-1 border-b border-white/[0.08] bg-[#0d0e11]/60 px-2.5 py-1.5"
    >
      {/* Inline marks */}
      <ToolbarGroup>
        <ToolbarBtn
          icon={Bold}
          label="Bold (Ctrl+B)"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarBtn
          icon={Italic}
          label="Italic (Ctrl+I)"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarBtn
          icon={UnderlineIcon}
          label="Underline (Ctrl+U)"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolbarBtn
          icon={Strikethrough}
          label="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
      </ToolbarGroup>

      <ToolbarSeparator />

      {/* Headings */}
      <ToolbarGroup>
        <ToolbarBtn
          icon={Heading1}
          label="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <ToolbarBtn
          icon={Heading2}
          label="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
      </ToolbarGroup>

      <ToolbarSeparator />

      {/* Lists & blocks */}
      <ToolbarGroup>
        <ToolbarBtn
          icon={List}
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarBtn
          icon={ListOrdered}
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarBtn
          icon={Quote}
          label="Blockquote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarBtn
          icon={Code2}
          label="Code block"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />
      </ToolbarGroup>

      <ToolbarSeparator />

      {/* Alignment */}
      <ToolbarGroup>
        <ToolbarBtn
          icon={AlignLeft}
          label="Align left"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        />
        <ToolbarBtn
          icon={AlignCenter}
          label="Align center"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        />
        <ToolbarBtn
          icon={AlignRight}
          label="Align right"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        />
        <ToolbarBtn
          icon={AlignJustify}
          label="Justify"
          active={editor.isActive({ textAlign: "justify" })}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        />
      </ToolbarGroup>

      <ToolbarSeparator />

      {/* Link — toggled inline, not window.prompt */}
      <ToolbarGroup>
        <ToolbarBtn
          icon={Link2}
          label={linkOpen ? "Close link editor" : "Insert / edit link"}
          active={linkOpen || editor.isActive("link")}
          onClick={onLinkToggle}
        />
      </ToolbarGroup>

      <ToolbarSeparator />

      {/* Utility */}
      <ToolbarGroup>
        <ToolbarBtn
          icon={Minus}
          label="Horizontal rule"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        />
        <ToolbarBtn
          icon={Undo2}
          label="Undo (Ctrl+Z)"
          disabled={!editor.can().chain().focus().undo().run()}
          onClick={() => editor.chain().focus().undo().run()}
        />
        <ToolbarBtn
          icon={Redo2}
          label="Redo (Ctrl+Shift+Z)"
          disabled={!editor.can().chain().focus().redo().run()}
          onClick={() => editor.chain().focus().redo().run()}
        />
        <ToolbarBtn
          icon={Eraser}
          label="Clear formatting"
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
        />
      </ToolbarGroup>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────

export default function SupportRichTextEditor({
  value,
  onChange,
  placeholder = "Describe your issue...",
  minHeightClassName = "min-h-[180px]",
}: SupportRichTextEditorProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TiptapLink.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: `${minHeightClassName} support-editor-input w-full px-3 py-2.5 text-sm text-white focus:outline-none`,
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getHTML());
    },
  });

  // Keep external value in sync (e.g. form reset)
  useEffect(() => {
    if (!editor) return;
    const next = value || "";
    if (editor.getHTML() !== next) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, value]);

  // Close link popover when clicking outside the editor wrapper
  useEffect(() => {
    if (!linkOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setLinkOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [linkOpen]);

  if (!editor) {
    return (
      <div
        className={`${minHeightClassName} border border-white/[0.08] bg-[#0d0e11]/40 rounded-[6px]`}
      />
    );
  }

  return (
    <div
      ref={wrapperRef}
      className="support-editor relative border border-white/[0.08] bg-[#0d0e11]/40 rounded-[6px] overflow-visible focus-within:border-[#0095FF]/40 focus-within:ring-1 focus-within:ring-[#0095FF]/20 transition-colors"
    >
      {/* Toolbar + popover share a relative container so top-full anchors to the toolbar bottom */}
      <div className="relative">
        <EditorToolbar
          editor={editor}
          linkOpen={linkOpen}
          onLinkToggle={() => setLinkOpen((prev) => !prev)}
        />
        <LinkPopover
          editor={editor}
          open={linkOpen}
          onClose={() => setLinkOpen(false)}
        />
      </div>

      <div className="overflow-hidden rounded-b-[6px]">
        <EditorContent editor={editor} />
      </div>

      <style jsx global>{`
        .support-editor .ProseMirror {
          white-space: pre-wrap;
        }
        .support-editor .ProseMirror p.is-editor-empty:first-child::before {
          color: rgba(255, 255, 255, 0.3);
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .support-editor .ProseMirror a {
          color: #60a5fa;
          text-decoration: underline;
          cursor: pointer;
        }
        .support-editor .ProseMirror a:hover {
          color: #93c5fd;
        }
        .support-editor .ProseMirror blockquote {
          border-left: 2px solid rgba(0, 149, 255, 0.4);
          margin: 0.5rem 0;
          padding: 0.25rem 0.75rem;
          color: rgba(255, 255, 255, 0.72);
        }
        .support-editor .ProseMirror pre {
          background: rgba(2, 6, 23, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          padding: 0.75rem;
          overflow-x: auto;
        }
        .support-editor .ProseMirror code {
          background: rgba(255, 255, 255, 0.07);
          border-radius: 3px;
          padding: 0.1em 0.3em;
          font-size: 0.85em;
        }
        .support-editor .ProseMirror ul,
        .support-editor .ProseMirror ol {
          padding-left: 1.3rem;
        }
        .support-editor .ProseMirror hr {
          border-color: rgba(255, 255, 255, 0.12);
          margin: 0.75rem 0;
        }
        .support-editor .ProseMirror h1 {
          font-size: 1.4em;
          font-weight: 600;
          margin: 0.75rem 0 0.25rem;
          line-height: 1.2;
        }
        .support-editor .ProseMirror h2 {
          font-size: 1.2em;
          font-weight: 600;
          margin: 0.6rem 0 0.2rem;
          line-height: 1.25;
        }
      `}</style>
    </div>
  );
}
