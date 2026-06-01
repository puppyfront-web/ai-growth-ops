'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, FileImage, FileVideo, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

type FileUploadProps = {
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // in bytes
  onFiles: (files: File[]) => void;
  uploading?: boolean;
  progress?: number;
  className?: string;
};

function getFileIcon(file: File) {
  if (file.type.startsWith('image/')) return <FileImage className="h-5 w-5 text-blue-500" />;
  if (file.type.startsWith('video/')) return <FileVideo className="h-5 w-5 text-purple-500" />;
  return <Upload className="h-5 w-5 text-muted-foreground" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUpload({
  accept,
  multiple = false,
  maxSize = 50 * 1024 * 1024, // 50MB default
  onFiles,
  uploading = false,
  progress = 0,
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const validateFiles = useCallback(
    (files: FileList | File[]): { valid: File[]; errors: string[] } => {
      const valid: File[] = [];
      const errs: string[] = [];
      const fileArr = Array.from(files);

      for (const file of fileArr) {
        if (maxSize && file.size > maxSize) {
          errs.push(`"${file.name}" 超过大小限制 ${formatFileSize(maxSize)}`);
          continue;
        }
        if (accept) {
          const acceptedTypes = accept.split(',').map((t) => t.trim());
          const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
          const matchesType = acceptedTypes.some(
            (t) =>
              t === fileExt ||
              (t.endsWith('/*') && file.type.startsWith(t.replace('/*', '/'))) ||
              file.type === t,
          );
          if (!matchesType) {
            errs.push(`"${file.name}" 文件类型不支持`);
            continue;
          }
        }
        valid.push(file);
      }

      return { valid, errors: errs };
    },
    [accept, maxSize],
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const { valid, errors: errs } = validateFiles(files);
      setErrors(errs);
      if (valid.length > 0) {
        const newFiles = multiple ? valid : [valid[0]];
        setSelectedFiles(newFiles);
        onFiles(newFiles);
      }
    },
    [multiple, onFiles, validateFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(e.target.files);
      }
    },
    [handleFiles],
  );

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Drop zone */}
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer',
          dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
          uploading && 'pointer-events-none opacity-60',
        )}
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm font-medium">拖拽文件到此处，或点击选择</p>
        <p className="text-xs text-muted-foreground mt-1">
          {accept ? `支持格式: ${accept}` : '支持所有格式'}
          {maxSize && ` | 最大 ${formatFileSize(maxSize)}`}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      {/* Selected files preview */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          {selectedFiles.map((file, index) => (
            <div key={`${file.name}-${index}`} className="flex items-center gap-3 rounded-lg border p-3">
              {file.type.startsWith('image/') ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="h-12 w-12 rounded object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">
                  {getFileIcon(file)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
              </div>
              {!uploading && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeFile(index)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="space-y-1">
          <Progress value={progress} />
          <p className="text-xs text-muted-foreground text-center">上传中 {progress}%</p>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-destructive">{err}</p>
          ))}
        </div>
      )}
    </div>
  );
}
