'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { generateMedia, listMediaAssets } from '@/lib/api/media';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/LoadingState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatDate } from '@/lib/utils';
import { Image, Video, FileText, Sparkles, RefreshCw, Download, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import type { MediaAsset } from '@/types/media';

const generationTypes = [
  { key: 'image', label: '图片生成', icon: Image, desc: '根据描述生成营销配图、封面图等' },
  { key: 'cover', label: '视频封面', icon: Video, desc: '为视频内容自动生成吸引人的封面' },
  { key: 'copywrite', label: '文案配图', icon: FileText, desc: '为文章/图文内容生成配套插图' },
];

const sizes = ['1024x1024', '1024x1792', '1792x1024'] as const;

export default function MediaGenerationPage() {
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState('');
  const [genType, setGenType] = useState('image');
  const [style, setStyle] = useState('');
  const [size, setSize] = useState<string>('1024x1024');

  const generateMutation = useMutation({
    mutationFn: () => generateMedia({ prompt, generationType: genType, style: style || undefined, size }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.media.assets }),
  });

  const { data: generatedAssets, isLoading: loadingHistory } = useQuery<MediaAsset[]>({
    queryKey: [...queryKeys.media.assets, 'generated'],
    queryFn: () => listMediaAssets({ sourceType: 'generated_future' }),
  });

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    generateMutation.mutate();
  };

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="AI 素材生成" description="使用 AI 生成营销图片、视频封面和配图" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Generation form */}
        <div className="lg:col-span-2 space-y-4">
          {/* Type selector */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {generationTypes.map((gt) => (
              <button
                key={gt.key}
                onClick={() => setGenType(gt.key)}
                className={`rounded-lg border p-4 text-left transition-colors ${genType === gt.key ? 'border-primary bg-primary/5' : 'hover:bg-accent/50'}`}
              >
                <gt.icon className={`h-6 w-6 mb-2 ${genType === gt.key ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="text-sm font-medium">{gt.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{gt.desc}</div>
              </button>
            ))}
          </div>

          {/* Prompt input */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <CardTitle className="text-base font-semibold">描述你想要生成的素材</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="例如：为一条关于夏季护肤的抖音视频生成封面，风格清新自然，包含防晒霜产品特写..."
                className="w-full rounded-md border p-2 text-sm resize-none"
              />
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">风格</label>
                  <select value={style} onChange={(e) => setStyle(e.target.value)} className="rounded-md border p-1.5 text-sm">
                    <option value="">默认</option>
                    <option value="自然清新">自然清新</option>
                    <option value="商务专业">商务专业</option>
                    <option value="潮流时尚">潮流时尚</option>
                    <option value="简约文艺">简约文艺</option>
                    <option value="可爱卡通">可爱卡通</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">尺寸</label>
                  <select value={size} onChange={(e) => setSize(e.target.value)} className="rounded-md border p-1.5 text-sm">
                    {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={handleGenerate} disabled={!prompt.trim() || generateMutation.isPending}>
                  {generateMutation.isPending ? (
                    <><RefreshCw className="mr-1 h-4 w-4 animate-spin" />生成中...</>
                  ) : (
                    <><Sparkles className="mr-1 h-4 w-4" />生成素材</>
                  )}
                </Button>
                {generateMutation.isError && (
                  <span className="text-sm text-red-500">生成失败，请检查 AI 配置</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Generated preview */}
          {generateMutation.isSuccess && generateMutation.data && (
            <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                  <CardTitle className="text-base font-semibold text-emerald-700">生成成功</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  <div className="h-24 w-24 flex-shrink-0 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
                    <Image className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{generateMutation.data.fileName}</div>
                    <div className="text-xs text-muted-foreground">
                      Provider: {generateMutation.data.generationProvider ?? '-'}
                      {generateMutation.data.costEstimate != null && ` · 预估费用: $${generateMutation.data.costEstimate.toFixed(4)}`}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <StatusBadge status={generateMutation.data.reviewStatus} label={generateMutation.data.reviewStatus === 'pending_review' ? '待审核' : generateMutation.data.reviewStatus} />
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/media"><ExternalLink className="mr-1 h-3 w-3" />在素材库查看</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: History */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">历史生成</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <LoadingState rows={3} />
              ) : (generatedAssets ?? []).length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">暂无生成记录</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {(generatedAssets ?? []).map((asset) => (
                    <div key={asset.id} className="flex items-center gap-2 rounded-lg border p-2">
                      <div className="h-10 w-10 flex-shrink-0 rounded bg-muted flex items-center justify-center">
                        <Image className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate">{asset.fileName}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {asset.generationProvider ?? 'AI'} · {formatDate(asset.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
