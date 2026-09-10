'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import {
  createContentItem,
  generatePlatformVariants,
  generateContentWithMedia,
  checkContentCompliance
} from '@/lib/api/content';
import { ApiError } from '@/lib/api/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import type { UploadedFile } from '@/components/media/FileUpload';
import {
  ContentMediaPanel,
  missingMediaMessage
} from '@/components/content/ContentMediaPanel';
import { platformLabels, platformIcons } from '@/lib/constants';
import type { Platform } from '@/types/enums';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, Loader2, Sparkles } from 'lucide-react';

const allPlatforms: Platform[] = [
  'douyin',
  'xiaohongshu',
  'wechat_official',
  'wechat_channels',
  'baijiahao',
  'zhihu'
];

const manualSchema = z.object({
  title: z.string().min(1, '标题必填'),
  type: z.enum(['text_image', 'video', 'article', 'answer']),
  body: z.string().optional()
});

const aiSchema = z.object({
  topic: z.string().min(1, '主题必填'),
  contentType: z.enum(['text_image', 'video', 'article', 'answer']),
  keywords: z.string().optional(),
  brandTone: z.string().optional(),
  imageStyle: z.string().optional()
});

type ManualFormData = z.infer<typeof manualSchema>;
type AiFormData = z.infer<typeof aiSchema>;

type PipelineStep = 'writing' | 'variants' | 'compliance';

const pipelineSteps: Array<{ key: PipelineStep; label: string; skill: string }> =
  [
    { key: 'writing', label: 'AI 撰写内容', skill: 'content-writing' },
    { key: 'variants', label: '多平台改写', skill: 'platform-rewrite' },
    { key: 'compliance', label: '合规检查', skill: 'compliance-check' }
  ];

function PlatformSelector({
  selectedPlatforms,
  onToggle,
  hint
}: {
  selectedPlatforms: Set<Platform>;
  onToggle: (p: Platform) => void;
  hint: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="text-sm font-semibold mb-3">目标平台</h3>
      <p className="text-xs text-muted-foreground mb-3">{hint}</p>
      <div className="space-y-2">
        {allPlatforms.map((p) => (
          <label
            key={p}
            className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 hover:bg-accent"
          >
            <input
              type="checkbox"
              checked={selectedPlatforms.has(p)}
              onChange={() => onToggle(p)}
              className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-lg">{platformIcons[p]}</span>
            <span className="text-sm">{platformLabels[p]}</span>
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        已选 {selectedPlatforms.size} / {allPlatforms.length} 个平台
      </p>
    </div>
  );
}

function PipelineProgress({ currentStep }: { currentStep: PipelineStep | null }) {
  const currentIndex = currentStep
    ? pipelineSteps.findIndex((s) => s.key === currentStep)
    : -1;
  const progressValue =
    currentIndex >= 0 ? ((currentIndex + 1) / pipelineSteps.length) * 100 : 0;

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        正在串联 Skill 生成内容…
      </div>
      <Progress value={progressValue} className="h-2" />
      <ul className="space-y-2">
        {pipelineSteps.map((step, index) => {
          const done = currentIndex > index;
          const active = currentIndex === index;
          return (
            <li key={step.key} className="flex items-start gap-2 text-sm">
              {done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : active ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div>
                <span className={active ? 'font-medium' : 'text-muted-foreground'}>
                  {step.label}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  ({step.skill})
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function NewContentPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pipelineStep, setPipelineStep] = useState<PipelineStep | null>(null);
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<Platform>>(
    new Set(allPlatforms)
  );

  const manualForm = useForm<ManualFormData>({
    resolver: zodResolver(manualSchema),
    defaultValues: { type: 'text_image' }
  });

  const aiForm = useForm<AiFormData>({
    resolver: zodResolver(aiSchema),
    defaultValues: {
      contentType: 'text_image',
      brandTone: '专业、友好',
      imageStyle: '清新自然，适合社交媒体'
    }
  });

  const contentType = manualForm.watch('type');
  const aiContentType = aiForm.watch('contentType');

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const onManualSubmit = async (data: ManualFormData) => {
    if (
      (data.type === 'text_image' || data.type === 'video') &&
      mediaIds.length === 0
    ) {
      setSubmitError(missingMediaMessage(data.type));
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const item = await createContentItem({
        title: data.title,
        type: data.type,
        body: data.body,
        mediaAssetIds: mediaIds
      });
      if (selectedPlatforms.size > 0) {
        await generatePlatformVariants(item.id, Array.from(selectedPlatforms));
      }
      router.push(`/content/${item.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const onAiSubmit = async (data: AiFormData) => {
    if (selectedPlatforms.size === 0) {
      setSubmitError('请至少选择一个目标平台');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setPipelineStep('writing');

    const keywords = data.keywords
      ?.split(/[,，、\s]+/)
      .map((k) => k.trim())
      .filter(Boolean);

    try {
      const generated = await generateContentWithMedia({
        topic: data.topic,
        contentType: data.contentType,
        keywords: keywords?.length ? keywords : undefined,
        brandTone: data.brandTone || undefined,
        imageStyle:
          data.contentType === 'text_image' || data.contentType === 'video'
            ? data.imageStyle || '清新自然，适合社交媒体'
            : undefined,
        imageCount: data.contentType === 'text_image' ? 1 : undefined
      });

      setPipelineStep('variants');
      const variants = await generatePlatformVariants(
        generated.contentItem.id,
        Array.from(selectedPlatforms)
      );

      setPipelineStep('compliance');
      await checkContentCompliance(generated.contentItem.id);

      const tab = variants.length > 0 ? 'variants' : 'edit';
      router.push(`/content/${generated.contentItem.id}?tab=${tab}`);
    } catch (err) {
      const message =
        err instanceof TypeError
          ? 'AI 生成超时或服务中断，请稍后重试'
          : err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'AI 生成失败';
      setSubmitError(message);
      setPipelineStep(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="新建内容"
        description="AI 一键生成或手动创建，自动串联多平台改写与合规检查"
      />

      <Tabs value={mode} onValueChange={(v) => setMode(v as 'ai' | 'manual')}>
        <TabsList className="mb-6">
          <TabsTrigger value="ai" className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            AI 生成
          </TabsTrigger>
          <TabsTrigger value="manual">手动创建</TabsTrigger>
        </TabsList>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <TabsContent value="ai" className="lg:col-span-2 space-y-6">
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
              输入主题后，系统将依次调用{' '}
              <strong className="text-foreground">content-writing</strong> →{' '}
              <strong className="text-foreground">platform-rewrite</strong> →{' '}
              <strong className="text-foreground">compliance-check</strong>
              ，一次完成文案、多平台版本与合规检查。
            </div>

            {pipelineStep && submitting && (
              <PipelineProgress currentStep={pipelineStep} />
            )}

            <form
              onSubmit={aiForm.handleSubmit(onAiSubmit)}
              className="space-y-6"
            >
              <div className="space-y-2">
                <label className="text-sm font-medium">内容主题 *</label>
                <input
                  {...aiForm.register('topic')}
                  disabled={submitting}
                  className="w-full rounded-md border p-2 text-sm disabled:opacity-50"
                  placeholder="例如：夏季电风扇选购指南、工厂直销优势"
                />
                {aiForm.formState.errors.topic && (
                  <p className="text-xs text-destructive">
                    {aiForm.formState.errors.topic.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">内容类型</label>
                <select
                  {...aiForm.register('contentType')}
                  disabled={submitting}
                  className="w-full rounded-md border p-2 text-sm disabled:opacity-50"
                >
                  <option value="text_image">图文</option>
                  <option value="video">视频</option>
                  <option value="article">文章</option>
                  <option value="answer">问答</option>
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">关键词</label>
                  <input
                    {...aiForm.register('keywords')}
                    disabled={submitting}
                    className="w-full rounded-md border p-2 text-sm disabled:opacity-50"
                    placeholder="逗号分隔，如：性价比,静音,节能"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">品牌语调</label>
                  <input
                    {...aiForm.register('brandTone')}
                    disabled={submitting}
                    className="w-full rounded-md border p-2 text-sm disabled:opacity-50"
                    placeholder="专业、友好"
                  />
                </div>
              </div>

              {(aiContentType === 'text_image' || aiContentType === 'video') && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {aiContentType === 'video' ? '视频风格' : '配图风格'}
                  </label>
                  <input
                    {...aiForm.register('imageStyle')}
                    disabled={submitting}
                    className="w-full rounded-md border p-2 text-sm disabled:opacity-50"
                    placeholder="清新自然，适合社交媒体"
                  />
                  <p className="text-xs text-muted-foreground">
                    {aiContentType === 'video'
                      ? '填写后会按系统设置中的生视频 API 尝试生成视频'
                      : '填写后会按系统设置中的生图 API 尝试生成配图'}
                  </p>
                </div>
              )}

              {submitError && (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {submitError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      生成中…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      一键 AI 生成
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => router.back()}
                  disabled={submitting}
                  className="rounded-md border px-6 py-2 text-sm hover:bg-accent disabled:opacity-50"
                >
                  取消
                </button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="manual" className="lg:col-span-2">
            <form
              onSubmit={manualForm.handleSubmit(onManualSubmit)}
              className="space-y-6"
            >
              <div className="space-y-2">
                <label className="text-sm font-medium">标题</label>
                <input
                  {...manualForm.register('title')}
                  className="w-full rounded-md border p-2 text-sm"
                  placeholder="输入内容标题"
                />
                {manualForm.formState.errors.title && (
                  <p className="text-xs text-destructive">
                    {manualForm.formState.errors.title.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">内容类型</label>
                <select
                  {...manualForm.register('type')}
                  className="w-full rounded-md border p-2 text-sm"
                >
                  <option value="text_image">图文</option>
                  <option value="video">视频</option>
                  <option value="article">文章</option>
                  <option value="answer">问答</option>
                </select>
              </div>

              <ContentMediaPanel
                contentType={contentType}
                value={mediaIds}
                onChange={setMediaIds}
                uploads={uploads}
                onUploadsChange={setUploads}
                error={null}
              />

              <div className="space-y-2">
                <label className="text-sm font-medium">正文文案</label>
                <textarea
                  {...manualForm.register('body')}
                  rows={10}
                  className="w-full rounded-md border p-2 text-sm"
                  placeholder="输入正文内容..."
                />
              </div>

              {submitError && mode === 'manual' && (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {submitError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? '创建中...' : '创建'}
                </button>
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="rounded-md border px-6 py-2 text-sm hover:bg-accent"
                >
                  取消
                </button>
              </div>
            </form>
          </TabsContent>

          <div className="space-y-4">
            <PlatformSelector
              selectedPlatforms={selectedPlatforms}
              onToggle={togglePlatform}
              hint={
                mode === 'ai'
                  ? 'AI 生成后将自动改写为选中平台的专属版本'
                  : '创建后自动生成选中平台的版本'
              }
            />
          </div>
        </div>
      </Tabs>
    </div>
  );
}
