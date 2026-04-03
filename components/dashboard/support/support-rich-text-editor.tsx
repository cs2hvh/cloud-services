"use client";

import { useEffect, useRef } from "react";

interface SupportRichTextEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeightClassName?: string;
}

function iconButtonClassName(active = false): string {
  return `rounded border px-2 py-1 text-xs transition-colors ${
    active
      ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-200"
      : "border-white/15 bg-black/25 text-white/80 hover:bg-white/10"
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
    <div className="rounded-lg border border-white/10 bg-black/30">
      <div className="flex flex-wrap gap-1 border-b border-white/10 p-2">
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

