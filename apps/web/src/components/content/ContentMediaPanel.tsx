'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { FileUpload, type UploadedFile } from '@/components/media/FileUpload';
import { generateMedia } from '@/lib/api/media';
import { ApiError } from '@/lib/api/client';

export type ContentMediaKind = 'image' | 'video';

export function mediaRequirement(type: string): {
  kind: ContentMediaKind;
  required: boolean;
  accept: string;
  maxFiles: number;
  label: string;
} {
  if (type === 'video') {
    return {
      kind: 'video',
      required: true,
      accept: 'video/*',
      maxFiles: 1,
      label: '视频'
    };
  }
  if (type === 'text_image') {
    return {
      kind: 'image',
      required: true,
      accept: 'image/*',
      maxFiles: 9,
      label: '配图'
    };
  }
  return {
    kind: 'image',
    required: false,
    accept: 'image/*,video/*',
    maxFiles: 9,
    label: '素材'
  };
}

export function missingMediaMessage(type: string): string {
  return type === 'video'
    ? '视频内容请先上传或生成一条视频'
    : '图文内容请先上传或生成至少一张图片';
}

interface ContentMediaPanelProps {
  contentType: string;
  value: string[];
  onChange: (ids: string[]) => void;
  uploads: UploadedFile[];
  onUploadsChange: (files: UploadedFile[]) => void;
  defaultPrompt?: string;
  error?: string | null;
}

export function ContentMediaPanel({
  contentType,
  value,
  onChange,
  uploads,
  onUploadsChange,
  defaultPrompt = '',
  error
}: ContentMediaPanelProps) {
  const req = mediaRequirement(contentType);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const onGenerate = async () => {
    const text = prompt.trim();
    if (!text) {
      setGenError(`请先填写${req.kind === 'video' ? '视频' : '图片'}描述`);
      return;
    }
    setGenerating(true);
    setGenError(null);
    try {
      const asset = await generateMedia({
        prompt: text,
        generationType: req.kind
      });
      onUploadsChange([
        ...uploads,
        {
          id: asset.id,
          fileName: asset.fileName,
          fileType: asset.fileType,
          sourceUrl: asset.sourceUrl ?? ''
        }
      ]);
      onChange([...value, asset.id]);
    } catch (err) {
      setGenError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : '生成失败'
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <label className="text-sm font-medium">{req.label}</label>
        {req.required && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600">
            必传
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {req.kind === 'video'
            ? '上传 MP4 / MOV，或配置生视频 API 后一键生成'
            : '上传 JPG / PNG / WebP，或配置生图 API 后一键生成'}
        </span>
      </div>
      {(error || genError) && (
        <p className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-xs text-red-600">
          {error || genError}
        </p>
      )}
      <FileUpload
        accept={req.accept}
        maxFiles={req.maxFiles}
        value={value}
        onChange={onChange}
        uploads={uploads}
        onUploadsChange={onUploadsChange}
      />
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium">
            {req.kind === 'video' ? 'AI 生成视频' : 'AI 生成图片'}
          </p>
          <Link
            href="/settings/ai"
            className="text-xs text-primary hover:underline"
          >
            配置生成 API
          </Link>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder={
            req.kind === 'video'
              ? '描述要生成的视频画面、时长和风格'
              : '描述要生成的配图主体、风格和用途'
          }
          className="w-full rounded-md border p-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={generating || value.length >= req.maxFiles}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {generating ? '生成中…' : '生成并加入素材'}
        </button>
      </div>
    </div>
  );
}
