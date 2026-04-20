'use client';

import { Upload } from 'lucide-react';

interface EnvVarsUploadProps {
  isDraggingFile: boolean;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function EnvVarsUpload({ isDraggingFile, onFileInput }: EnvVarsUploadProps) {
  return (
    <>
      {/* Full-screen drop overlay */}
      {isDraggingFile && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-white rounded-xl p-12 bg-white/10 backdrop-blur-sm">
            <div className="text-center">
              <Upload className="h-12 w-12 text-white mx-auto mb-4" />
              <p className="text-white text-lg font-medium">Drop your .env file here</p>
              <p className="text-white/60 text-sm mt-1">
                We&apos;ll import all variables automatically
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Clickable / drag-target drop zone */}
      <div className="relative">
        <input
          type="file"
          accept=".env,.env.*,text/*"
          onChange={onFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          id="env-file-input"
          aria-label="Upload .env file"
        />
        <div className="border-2 border-dashed border-white/20 rounded-lg p-4 text-center hover:border-white/40 hover:bg-white/5 transition-colors cursor-pointer">
          <Upload className="h-5 w-5 text-white/50 mx-auto mb-2" />
          <p className="text-white/70 text-sm">
            <span className="text-white font-medium">Click to upload</span> or drag &amp; drop
            your .env file
          </p>
          <p className="text-white/40 text-xs mt-1">
            Supports .env, .env.local, .env.production, etc.
          </p>
        </div>
      </div>
    </>
  );
}
