'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { createResearchTask } from '@/lib/api/research';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

const schema = z.object({
  type: z.enum(['keyword_search', 'competitor_analysis', 'comment_sampling']),
  platforms: z.array(z.string()).min(1, '至少选择一个平台'),
  keywords: z.string().optional(),
  targetAccountUrl: z.string().url().optional().or(z.literal('')),
  contentLimit: z.number().max(50).default(50),
  commentLimit: z.number().max(200).default(200),
  enableRateLimit: z.boolean().default(true),
  enableCircuitBreaker: z.boolean().default(true),
});

type FormData = z.infer<typeof schema>;

export default function NewResearchPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'keyword_search', platforms: [], contentLimit: 50, commentLimit: 200, enableRateLimit: true, enableCircuitBreaker: true },
  });

  const taskType = watch('type');

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const keywords = data.keywords ? data.keywords.split(',').map((k) => k.trim()).filter(Boolean) : [];
      await createResearchTask({ type: data.type, platforms: data.platforms as any, keywords });
      router.push('/research');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="新建调研任务" />
      <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">任务类型</label>
          <select {...register('type')} className="w-full rounded-md border p-2 text-sm">
            <option value="keyword_search">关键词搜索</option>
            <option value="competitor_analysis">竞品账号</option>
            <option value="comment_sampling">评论采样</option>
          </select>
          {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">调研平台</label>
          <div className="flex gap-4">
            {['xiaohongshu', 'douyin', 'zhihu'].map((p) => (
              <label key={p} className="flex items-center gap-2">
                <input type="checkbox" value={p} {...register('platforms')} className="rounded" />
                <span className="text-sm">{{ xiaohongshu: '小红书', douyin: '抖音', zhihu: '知乎' }[p]}</span>
              </label>
            ))}
          </div>
          {errors.platforms && <p className="text-xs text-destructive">{errors.platforms.message}</p>}
        </div>

        {taskType === 'keyword_search' && (
          <div className="space-y-2">
            <label className="text-sm font-medium">关键词（用逗号分隔）</label>
            <input {...register('keywords')} className="w-full rounded-md border p-2 text-sm" placeholder="AI获客, 内容营销" />
          </div>
        )}

        {taskType === 'competitor_analysis' && (
          <div className="space-y-2">
            <label className="text-sm font-medium">竞品账号 URL</label>
            <input {...register('targetAccountUrl')} className="w-full rounded-md border p-2 text-sm" placeholder="https://www.xiaohongshu.com/user/profile/xxx" />
            {errors.targetAccountUrl && <p className="text-xs text-destructive">{errors.targetAccountUrl.message}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">采集内容数量上限</label>
            <input type="number" {...register('contentLimit', { valueAsNumber: true })} className="w-full rounded-md border p-2 text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">评论采样数量上限</label>
            <input type="number" {...register('commentLimit', { valueAsNumber: true })} className="w-full rounded-md border p-2 text-sm" />
          </div>
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('enableRateLimit')} className="rounded" />
            <span className="text-sm">启用限频</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('enableCircuitBreaker')} className="rounded" />
            <span className="text-sm">启用失败熔断</span>
          </label>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={submitting} className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {submitting ? '创建中...' : '创建任务'}
          </button>
          <button type="button" onClick={() => router.back()} className="rounded-md border px-6 py-2 text-sm hover:bg-accent">取消</button>
        </div>
      </form>
    </div>
  );
}
