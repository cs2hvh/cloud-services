"use client";

import { useEffect, useRef } from "react";

interface SupportRichTextEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeightClassName?: string;
}

function iconButtonClassName(active = false): string {
  return `border px-2 py-1 text-xs transition-colors ${
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
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  const emitChange = () => {
    onChange(editorRef.current?.innerHTML || "");
  };

  const runCommand = (command: string, commandValue?: string) => {
    document.execCommand(command, false, commandValue);
    editorRef.current?.focus();
    emitChange();
  };

  return (
    <div className="border border-white/[0.1] bg-white/[0.03]">
      <div className="flex flex-wrap gap-1 border-b border-white/[0.1] p-2">
        <button type="button" onClick={() => runCommand("bold")} className={iconButtonClassName()}>
          Bold
        </button>
        <button type="button" onClick={() => runCommand("italic")} className={iconButtonClassName()}>
          Italic
        </button>
        <button type="button" onClick={() => runCommand("underline")} className={iconButtonClassName()}>
          Underline
        </button>
        <button type="button" onClick={() => runCommand("insertUnorderedList")} className={iconButtonClassName()}>
          Bullets
        </button>
        <button type="button" onClick={() => runCommand("justifyLeft")} className={iconButtonClassName()}>
          Left
        </button>
        <button type="button" onClick={() => runCommand("justifyCenter")} className={iconButtonClassName()}>
          Center
        </button>
        <button type="button" onClick={() => runCommand("justifyRight")} className={iconButtonClassName()}>
          Right
        </button>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className={`${minHeightClassName} w-full px-3 py-2 text-sm text-white focus:outline-none`}
        data-placeholder={placeholder}
        onInput={emitChange}
        onBlur={emitChange}
        style={{ whiteSpace: "pre-wrap" }}
      />

      <style jsx>{`
        div[contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: rgba(255, 255, 255, 0.35);
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
