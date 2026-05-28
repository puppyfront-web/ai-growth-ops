'use client';

import { useState, useRef, useCallback } from 'react';
import { apiUpload } from '@/lib/api/client';

export interface UploadedFile {
  id: string;
  fileName: string;
  fileType: string;
  sourceUrl: string;
}

interface FileUploadProps {
  accept?: string;
  maxFiles?: number;
  value: string[];
  onChange: (ids: string[]) => void;
  uploads: UploadedFile[];
  onUploadsChange: (files: UploadedFile[]) => void;
}

export function FileUpload({ accept = 'image/*,video/*', maxFiles = 9, value, onChange, uploads, onUploadsChange }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const remaining = maxFiles - value.length;
    const files = Array.from(fileList).slice(0, remaining);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      const data = await apiUpload<Record<string, unknown> | Record<string, unknown>[]>('/api/media-assets', formData);
      const assets = Array.isArray(data) ? data : [data];
      const newUploads: UploadedFile[] = assets.map((a: Record<string, unknown>) => ({
        id: a.id as string,
        fileName: (a.fileName as string) ?? 'untitled',
        fileType: (a.fileType as string) ?? 'application/octet-stream',
        sourceUrl: (a.sourceUrl as string) ?? '',
      }));
      onUploadsChange([...uploads, ...newUploads]);
      onChange([...value, ...newUploads.map((u) => u.id)]);
    } finally {
      setUploading(false);
    }
  }, [value, uploads, maxFiles, onChange, onUploadsChange]);

  const removeFile = (id: string) => {
    onUploadsChange(uploads.filter((u) => u.id !== id));
    onChange(value.filter((v) => v !== id));
  };

  const isImage = (ft?: string | null) => (ft ?? '').startsWith('image/');

  return (
    <div className="space-y-3">
      <div
        className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${dragActive ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'}`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
      >
        <p className="text-sm text-muted-foreground">
          {uploading ? '上传中...' : '拖拽文件到此处，或'}
          {!uploading && (
            <button type="button" onClick={() => inputRef.current?.click()} className="text-primary hover:underline">
              选择文件
            </button>
          )}
        </p>
        <input ref={inputRef} type="file" accept={accept} multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {uploads.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {uploads.map((file) => (
            <div key={file.id} className="relative group rounded-lg border bg-muted/30 overflow-hidden">
              {isImage(file.fileType) ? (
                <img src={file.sourceUrl} alt={file.fileName} className="h-24 w-full object-cover" />
              ) : (
                <div className="h-24 flex items-center justify-center text-muted-foreground text-xs">视频文件</div>
              )}
              <div className="p-1.5 flex items-center justify-between">
                <span className="text-xs truncate max-w-[80%]">{file.fileName}</span>
                <button type="button" onClick={() => removeFile(file.id)} className="text-xs text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
