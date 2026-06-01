'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { createContentItem, generatePlatformVariants } from '@/lib/api/content';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { FileUpload } from '@/components/media/FileUpload';
import type { UploadedFile } from '@/components/media/FileUpload';
import { PlatformBadge } from '@/components/shared/StatusBadge';
import { platformLabels, platformIcons } from '@/lib/constants';
import type { Platform } from '@/types/enums';

const allPlatforms: Platform[] = ['douyin', 'xiaohongshu', 'wechat_official', 'wechat_channels', 'baijiahao', 'zhihu'];

const schema = z.object({
  title: z.string().min(1, '标题必填'),
  type: z.enum(['text_image', 'video', 'article', 'answer']),
  body: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewContentPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<Platform>>(new Set(allPlatforms));
  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'text_image' },
  });

  const contentType = watch('type');

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  };

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const item = await createContentItem({ title: data.title, type: data.type, body: data.body, mediaAssetIds: mediaIds });
      if (selectedPlatforms.size > 0) {
        await generatePlatformVariants(item.id, Array.from(selectedPlatforms));
      }
      router.push(`/content/${item.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  const acceptMap: Record<string, string> = {
    text_image: 'image/*',
    video: 'video/*',
    article: 'image/*',
    answer: 'image/*',
  };

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="新建内容" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={handleSubmit(onSubmit)} className="lg:col-span-2 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">标题</label>
            <input {...register('title')} className="w-full rounded-md border p-2 text-sm" placeholder="输入内容标题" />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">内容类型</label>
            <select {...register('type')} className="w-full rounded-md border p-2 text-sm">
              <option value="text_image">图文</option>
              <option value="video">视频</option>
              <option value="article">文章</option>
              <option value="answer">问答</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">上传素材</label>
            <FileUpload
              accept={acceptMap[contentType] ?? 'image/*,video/*'}
              value={mediaIds}
              onChange={setMediaIds}
              uploads={uploads}
              onUploadsChange={setUploads}
            />
            <p className="text-xs text-muted-foreground">
              {contentType === 'video' ? '支持 MP4、MOV 格式' : '支持 JPG、PNG、WebP 格式'}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">正文文案</label>
            <textarea {...register('body')} rows={10} className="w-full rounded-md border p-2 text-sm" placeholder="输入正文内容..." />
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{submitting ? '创建中...' : '创建'}</button>
            <button type="button" onClick={() => router.back()} className="rounded-md border px-6 py-2 text-sm hover:bg-accent">取消</button>
          </div>
        </form>

        {/* Platform selection sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">目标平台</h3>
            <p className="text-xs text-muted-foreground mb-3">创建后自动生成选中平台的版本</p>
            <div className="space-y-2">
              {allPlatforms.map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.has(p)}
                    onChange={() => togglePlatform(p)}
                    className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-lg">{platformIcons[p]}</span>
                  <span className="text-sm">{platformLabels[p]}</span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">已选 {selectedPlatforms.size} / {allPlatforms.length} 个平台</p>
          </div>
        </div>
      </div>
    </div>
  );
}
