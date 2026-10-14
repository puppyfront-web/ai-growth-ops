'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { uploadMedia } from '@/lib/api/media';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Button } from '@/components/ui/button';

export default function MediaUploadPage() {
  const router = useRouter();
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => uploadMedia(formData),
    onSuccess: () => router.push('/media')
  });

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append('files', file));
    uploadMutation.mutate(formData);
  };

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="上传素材" />
      <div className="max-w-2xl">
        <div
          className={`rounded-xl border-2 border-dashed p-12 text-center ${dragActive ? 'border-primary bg-primary/5' : 'border-muted'}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <div className="text-4xl mb-4">📁</div>
          <p className="text-lg font-medium">拖拽文件到此处上传</p>
          <p className="mt-1 text-sm text-muted-foreground">
            支持图片（JPG/PNG）和视频（MP4），单个文件最大 200MB
          </p>
          <Button
            onClick={() => fileInputRef.current?.click()}
            loading={uploadMutation.isPending}
            className="mt-4"
          >
            {uploadMutation.isPending ? '上传中...' : '选择文件'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          上传后素材默认进入"待审核"状态，审核通过后才能用于发布任务。
        </p>
      </div>
    </div>
  );
}
