'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { getContentItem, getContentVariants, updateContentItem, updateContentVariant, generatePlatformVariants, batchCreatePublishJobs } from '@/lib/api/content';
import { getPlatformAccounts, type PlatformAccount } from '@/lib/api/integrations';
import { getMediaAssetsByIds } from '@/lib/api/media';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PlatformBadge } from '@/components/shared/StatusBadge';
import { FileUpload, type UploadedFile } from '@/components/media/FileUpload';
import { platformLabels, platformIcons } from '@/lib/constants';
import type { Platform } from '@/types/enums';
import { useState, useMemo, useEffect } from 'react';

const allPlatforms: Platform[] = ['douyin', 'xiaohongshu', 'wechat_official', 'wechat_channels', 'baijiahao', 'zhihu'];

export default function ContentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const searchParams = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const initialTab = searchParams.get('tab') === 'variants' ? 'variants' : 'edit';
  const [activeTab, setActiveTab] = useState<'edit' | 'variants' | 'log'>(initialTab);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mediaAssetIds, setMediaAssetIds] = useState<string[]>([]);
  const [mediaUploads, setMediaUploads] = useState<UploadedFile[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [scheduledAt, setScheduledAt] = useState('');
  const [publishError, setPublishError] = useState<string | null>(null);
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editTags, setEditTags] = useState('');

  const { data: item, isLoading } = useQuery({
    queryKey: ['content-item', id],
    queryFn: () => getContentItem(id),
  });

  useEffect(() => {
    if (!item) return;
    setTitle(item.title ?? '');
    setBody(item.body ?? '');
    const ids = ((item.metadata as Record<string, unknown>)?.mediaAssetIds as string[] | undefined) ?? [];
    setMediaAssetIds(ids);
    if (ids.length > 0) {
      getMediaAssetsByIds(ids).then((assets) => {
        setMediaUploads(assets.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          fileType: a.fileType,
          sourceUrl: a.sourceUrl ?? '',
        })));
      });
    } else {
      setMediaUploads([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);
  const { data: variantsData } = useQuery({ queryKey: ['content-variants', id], queryFn: () => getContentVariants(id) });
  const variants = variantsData?.items ?? [];
  const { data: accounts } = useQuery({ queryKey: ['platform-accounts'], queryFn: getPlatformAccounts });

  const isTextImage = item?.type === 'text_image';

  const accountMap = useMemo(() => {
    const map = new Map<string, PlatformAccount>();
    for (const a of accounts ?? []) {
      if (a.status === 'active') map.set(a.platform, a);
    }
    return map;
  }, [accounts]);

  const existingPlatforms = useMemo(() => new Set(variants.map(v => v.platform)), [variants]);
  const platformsToGenerate = allPlatforms.filter(p => !existingPlatforms.has(p));

  const saveMutation = useMutation({
    mutationFn: () => {
      if (isTextImage && mediaAssetIds.length === 0) {
        return Promise.reject(new Error('图文类型内容必须上传至少一张图片'));
      }
      setSaveError(null);
      return updateContentItem(id, { title, body, mediaAssetIds });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-item', id] }),
    onError: (err: Error) => setSaveError(err.message),
  });

  const generateMutation = useMutation({
    mutationFn: (platforms: string[] | undefined) => generatePlatformVariants(id, platforms),
    onSuccess: () => { setActiveTab('variants'); qc.invalidateQueries({ queryKey: ['content-variants', id] }); }
  });

  const updateVariantMutation = useMutation({
    mutationFn: ({ variantId, data }: { variantId: string; data: { title?: string; body?: string; tags?: string[] } }) => updateContentVariant(variantId, data),
    onSuccess: () => { setEditingVariantId(null); qc.invalidateQueries({ queryKey: ['content-variants', id] }); }
  });

  const publishMutation = useMutation({
    mutationFn: () => {
      if (isTextImage && mediaAssetIds.length === 0) {
        return Promise.reject(new Error('图文类型内容必须先上传图片才能发布'));
      }
      const platformAccountIds = Array.from(selectedPlatforms)
        .map((p) => accountMap.get(p)?.id)
        .filter(Boolean) as string[];
      if (platformAccountIds.length === 0) {
        return Promise.reject(new Error('所选平台没有可用的活跃账号'));
      }
      return batchCreatePublishJobs({
        contentItemId: id,
        platformAccountIds,
        scheduledAt: scheduledAt || undefined,
      });
    },
    onSuccess: (jobs) => {
      if (!Array.isArray(jobs) || jobs.length === 0) {
        setPublishError('未创建发布任务：可能该平台已有发布任务，或缺少对应平台版本');
        return;
      }
      router.push('/publish/queue');
    },
    onError: (err: Error) => setPublishError(err.message ?? '发布失败'),
  });

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform); else next.add(platform);
      return next;
    });
    setPublishError(null);
  };

  const startEditVariant = (v: { id: string; title: string | null; body: string | null; tags: string[] }) => {
    setEditingVariantId(v.id);
    setEditTitle(v.title ?? '');
    setEditBody(v.body ?? '');
    setEditTags(v.tags.join(', '));
  };

  const saveVariant = (variantId: string) => {
    const tags = editTags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    updateVariantMutation.mutate({ variantId, data: { title: editTitle, body: editBody, tags } });
  };

  if (isLoading) return <LoadingState />;
  if (!item) return null;

  const tabs = [
    { key: 'edit' as const, label: '内容编辑' },
    { key: 'variants' as const, label: '平台版本' },
    { key: 'log' as const, label: '操作日志' },
  ];

  return (
    <div>
      <Breadcrumb />
      <PageHeader title={item.title} actions={
        <div className="flex gap-2">
          <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50">
            {saveMutation.isPending ? '保存中...' : '保存'}
          </button>
          <button onClick={() => generateMutation.mutate(undefined)} disabled={generateMutation.isPending} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
            {generateMutation.isPending ? '生成中...' : '生成全部版本'}
          </button>
        </div>
      } />

      <div className="flex gap-2 border-b mb-6">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'edit' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">标题</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border p-2 text-sm" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">正文文案</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} className="w-full rounded-md border p-3 text-sm" />
            </div>

            {isTextImage && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm font-medium">配图</label>
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600">必传</span>
                  <span className="text-xs text-muted-foreground">最多 9 张，支持 JPG / PNG / WebP</span>
                </div>
                {saveError && (
                  <p className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-xs text-red-600">{saveError}</p>
                )}
                <FileUpload
                  accept="image/*"
                  maxFiles={9}
                  value={mediaAssetIds}
                  onChange={(ids) => { setMediaAssetIds(ids); setSaveError(null); }}
                  uploads={mediaUploads}
                  onUploadsChange={setMediaUploads}
                />
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-2">内容信息</h3>
              <dl className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between"><dt>类型</dt><dd className="text-foreground">{item.type}</dd></div>
                <div className="flex justify-between"><dt>状态</dt><dd className="text-foreground">{item.status}</dd></div>
                <div className="flex justify-between"><dt>创建</dt><dd>{item.createdAt}</dd></div>
              </dl>
            </div>

            {isTextImage && (
              <div className={`rounded-xl border p-4 text-xs ${mediaAssetIds.length > 0 ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 text-green-700' : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 text-amber-700'}`}>
                {mediaAssetIds.length > 0
                  ? `✓ 已上传 ${mediaAssetIds.length} 张图片`
                  : '⚠ 图文内容尚未上传图片，保存和发布前请先添加配图'}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'variants' && (
        <div className="space-y-3">
          {isTextImage && mediaAssetIds.length === 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4 flex items-start gap-3">
              <span className="text-amber-500 text-base mt-0.5">⚠</span>
              <div>
                <p className="text-sm font-medium text-amber-800">图文内容缺少配图</p>
                <p className="text-xs text-amber-600 mt-0.5">请先在「内容编辑」标签上传图片，否则无法完成图文发布。</p>
              </div>
            </div>
          )}

          {platformsToGenerate.length > 0 && (
            <div className="rounded-xl border bg-blue-50 dark:bg-blue-950 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-800">未生成版本的平台</p>
                <p className="text-xs text-blue-600 mt-1">
                  {platformsToGenerate.map(p => platformLabels[p]).join('、')}
                </p>
              </div>
              <button
                onClick={() => generateMutation.mutate(platformsToGenerate)}
                disabled={generateMutation.isPending}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                补充生成
              </button>
            </div>
          )}

          {variants.length === 0 && (
            <div className="rounded-xl border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">尚未生成平台版本</p>
              <button
                onClick={() => generateMutation.mutate(undefined)}
                disabled={generateMutation.isPending}
                className="mt-3 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              >
                生成全部平台版本
              </button>
            </div>
          )}

          {variants.map((v) => {
            const account = accountMap.get(v.platform);
            const isRejected = v.complianceStatus === 'rejected';
            const canSelect = !!account && !isRejected;
            const reason = !account
              ? '未配置活跃账号'
              : isRejected
                ? '合规未通过'
                : v.complianceStatus === 'pending'
                  ? '待合规审核（可勾选发布）'
                  : null;
            const isEditing = editingVariantId === v.id;

            return (
              <div key={v.id} className={`rounded-xl border bg-card p-4 flex gap-4 ${!canSelect && !isEditing ? 'opacity-60' : ''}`}>
                <div className="flex items-start pt-1">
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.has(v.platform)}
                    onChange={() => canSelect && togglePlatform(v.platform)}
                    disabled={!canSelect}
                    className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{platformIcons[v.platform as Platform]}</span>
                    <PlatformBadge platform={v.platform} />
                    <StatusBadge status={v.complianceStatus} />
                    {reason && <span className="text-xs text-muted-foreground">{reason}</span>}
                  </div>

                  {isEditing ? (
                    <div className="space-y-3">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full rounded-md border p-2 text-sm"
                        placeholder="版本标题"
                      />
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={6}
                        className="w-full rounded-md border p-2 text-sm"
                        placeholder="版本正文（可针对平台特点调整）"
                      />
                      <input
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        className="w-full rounded-md border p-2 text-sm"
                        placeholder="标签，用逗号分隔"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveVariant(v.id)}
                          disabled={updateVariantMutation.isPending}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
                        >
                          {updateVariantMutation.isPending ? '保存中...' : '保存'}
                        </button>
                        <button onClick={() => setEditingVariantId(null)} className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">取消</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h4 className="font-medium text-sm">{v.title}</h4>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{v.body}</p>
                      {v.tags.length > 0 && (
                        <div className="mt-2 flex gap-1 flex-wrap">
                          {v.tags.map((t) => <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">#{t}</span>)}
                        </div>
                      )}
                      <button
                        onClick={() => startEditVariant(v)}
                        className="mt-2 text-xs text-primary hover:underline"
                      >
                        编辑
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {publishError && (
            <div className="rounded-md bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700">{publishError}</div>
          )}

          {variants.length > 0 && (
            <div className="sticky bottom-0 rounded-xl border bg-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm">已选 <strong>{selectedPlatforms.size}</strong> 个平台</span>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">计划时间</label>
                  <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="rounded-md border p-1.5 text-xs" />
                </div>
              </div>
              <button
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending || selectedPlatforms.size === 0 || (isTextImage && mediaAssetIds.length === 0)}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                title={isTextImage && mediaAssetIds.length === 0 ? '请先在「内容编辑」标签上传图片' : undefined}
              >
                {publishMutation.isPending ? '发布中...' : `发布到 ${selectedPlatforms.size} 个平台`}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'log' && (
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          <p>内容创建于 {item.createdAt}</p>
          <p>最后更新于 {item.updatedAt}</p>
        </div>
      )}
    </div>
  );
}
