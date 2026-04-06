"use client";

import { useCallback, useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";

interface SupportRichTextEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeightClassName?: string;
}

function toolbarButtonClassName(active = false): string {
  return `border px-2 py-1 text-xs font-medium transition-colors ${
    active
      ? "border-blue-400/30 bg-blue-500/15 text-blue-100"
      : "border-white/[0.12] bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
  }`;
}

export default function SupportRichTextEditor({
  value,
  onChange,
  placeholder = "Describe your issue...",
  minHeightClassName = "min-h-[180px]",
}: SupportRichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: `${minHeightClassName} support-editor-input w-full px-3 py-2 text-sm text-white focus:outline-none`,
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const next = value || "";
    if (editor.getHTML() !== next) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, value]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href || "";
    const url = window.prompt("Enter URL", previousUrl);
    if (url === null) return;

    if (url.trim() === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }, [editor]);

  if (!editor) {
    return <div className="min-h-[180px] border border-white/[0.1] bg-white/[0.03]" />;
  }

  return (
    <div className="support-editor border border-white/[0.1] bg-white/[0.03]">
      <div className="flex flex-wrap gap-1 border-b border-white/[0.1] p-2">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={toolbarButtonClassName(editor.isActive("bold"))}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={toolbarButtonClassName(editor.isActive("italic"))}
        >
          I
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={toolbarButtonClassName(editor.isActive("underline"))}
        >
          U
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={toolbarButtonClassName(editor.isActive("strike"))}
        >
          S
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={toolbarButtonClassName(editor.isActive("heading", { level: 1 }))}
        >
          H1
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={toolbarButtonClassName(editor.isActive("heading", { level: 2 }))}
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={toolbarButtonClassName(editor.isActive("bulletList"))}
        >
          Bullets
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={toolbarButtonClassName(editor.isActive("orderedList"))}
        >
          Numbered
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={toolbarButtonClassName(editor.isActive("blockquote"))}
        >
          Quote
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={toolbarButtonClassName(editor.isActive("codeBlock"))}
        >
          Code
        </button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("left").run()} className={toolbarButtonClassName(editor.isActive({ textAlign: "left" }))}>
          Left
        </button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("center").run()} className={toolbarButtonClassName(editor.isActive({ textAlign: "center" }))}>
          Center
        </button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("right").run()} className={toolbarButtonClassName(editor.isActive({ textAlign: "right" }))}>
          Right
        </button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("justify").run()} className={toolbarButtonClassName(editor.isActive({ textAlign: "justify" }))}>
          Justify
        </button>
        <button
          type="button"
          onClick={setLink}
          className={toolbarButtonClassName(editor.isActive("link"))}
        >
          Link
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().unsetLink().run()}
          className={toolbarButtonClassName(false)}
        >
          Unlink
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className={toolbarButtonClassName(false)}
        >
          Divider
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().chain().focus().undo().run()}
          className={toolbarButtonClassName(false)}
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().chain().focus().redo().run()}
          className={toolbarButtonClassName(false)}
        >
          Redo
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          className={toolbarButtonClassName(false)}
        >
          Clear
        </button>
      </div>

      <EditorContent editor={editor} />

      <style jsx global>{`
        .support-editor .ProseMirror {
          white-space: pre-wrap;
        }
        .support-editor .ProseMirror p.is-editor-empty:first-child::before {
          color: rgba(255, 255, 255, 0.35);
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .support-editor .ProseMirror a {
          color: rgb(147 197 253);
          text-decoration: underline;
        }
        .support-editor .ProseMirror blockquote {
          border-left: 2px solid rgba(255, 255, 255, 0.2);
          margin: 0.5rem 0;
          padding: 0.25rem 0.75rem;
          color: rgba(255, 255, 255, 0.82);
        }
        .support-editor .ProseMirror pre {
          background: rgba(2, 6, 23, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.15);
          padding: 0.75rem;
          overflow-x: auto;
        }
        .support-editor .ProseMirror ul,
        .support-editor .ProseMirror ol {
          padding-left: 1.3rem;
        }
        .support-editor .ProseMirror hr {
          border-color: rgba(255, 255, 255, 0.16);
          margin: 0.75rem 0;
        }
      `}</style>
    </div>
  );
}
