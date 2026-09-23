'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAiConfig, updateAiConfig } from '@/lib/api/settings';
import type { MediaGenerationConfig } from '@/lib/api/settings';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useState, useEffect } from 'react';
import { Image, Video } from 'lucide-react';
import Link from 'next/link';

export default function AiSettingsPage() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ['ai-config'],
    queryFn: getAiConfig
  });
  const [mediaGen, setMediaGen] = useState<MediaGenerationConfig>({
    mode: 'llm_provider',
    provider: 'openai',
    apiKey: '',
    baseUrl: '',
    model: 'dall-e-3',
    videoMode: 'dedicated',
    videoProvider: 'openai',
    videoApiKey: '',
    videoBaseUrl: '',
    videoModel: ''
  });

  useEffect(() => {
    if (config) {
      if (config.mediaGeneration) {
        setMediaGen({
          mode: config.mediaGeneration.mode ?? 'llm_provider',
          provider: config.mediaGeneration.provider ?? 'openai',
          apiKey: config.mediaGeneration.apiKey ?? '',
          baseUrl: config.mediaGeneration.baseUrl ?? '',
          model: config.mediaGeneration.model ?? 'dall-e-3',
          videoMode: config.mediaGeneration.videoMode ?? 'dedicated',
          videoProvider: config.mediaGeneration.videoProvider ?? 'openai',
          videoApiKey: config.mediaGeneration.videoApiKey ?? '',
          videoBaseUrl: config.mediaGeneration.videoBaseUrl ?? '',
          videoModel: config.mediaGeneration.videoModel ?? ''
        });
      }
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateAiConfig({
        mediaGeneration: mediaGen
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-config'] })
  });

  if (isLoading) return <LoadingState />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="素材生成配置"
        description="配置可选的图片与视频生成服务"
      />
      {config && (
        <div className="max-w-2xl space-y-6">
          <p className="text-sm text-muted-foreground">
            文本模型统一在 <Link href="/integrations/llm" className="underline">LLM 配置</Link> 中管理。
          </p>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Image className="h-4 w-4 text-emerald-500" />
                <CardTitle className="text-base font-semibold">
                  素材生成配置
                </CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">
                内容素材可上传本地文件，或在此配置生图 / 生视频 API
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Image className="h-4 w-4 text-emerald-500" />
                  生图 API
                </div>
                <div>
                  <label className="text-sm font-medium">配置模式</label>
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setMediaGen((m) => ({ ...m, mode: 'llm_provider' }))
                      }
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mediaGen.mode === 'llm_provider' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
                    >
                      复用 LLM 配置
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setMediaGen((m) => ({ ...m, mode: 'dedicated' }))
                      }
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mediaGen.mode === 'dedicated' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
                    >
                      独立配置
                    </button>
                  </div>
                </div>

                {mediaGen.mode === 'llm_provider' && (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-sm text-muted-foreground">
                      使用组织 LLM 配置的 API Key 调用 OpenAI 兼容{' '}
                      <code className="rounded bg-muted px-1">
                        /images/generations
                      </code>
                      。
                    </p>
                  </div>
                )}

                {mediaGen.mode === 'llm_provider' && (
                  <div>
                    <label className="text-sm font-medium">图片生成模型</label>
                    <input
                      value={mediaGen.model}
                      onChange={(e) =>
                        setMediaGen((m) => ({ ...m, model: e.target.value }))
                      }
                      placeholder="dall-e-3"
                      className="mt-1 w-full rounded-md border p-2 text-sm"
                    />
                  </div>
                )}

                {mediaGen.mode === 'dedicated' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium">Provider</label>
                      <select
                        value={mediaGen.provider}
                        onChange={(e) =>
                          setMediaGen((m) => ({
                            ...m,
                            provider: e.target.value
                          }))
                        }
                        className="mt-1 w-full rounded-md border p-2 text-sm"
                      >
                        <option value="openai">OpenAI (DALL·E)</option>
                        <option value="stability">Stability AI</option>
                        <option value="other">其他 OpenAI 兼容</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">API Key</label>
                      <input
                        type="password"
                        value={mediaGen.apiKey}
                        onChange={(e) =>
                          setMediaGen((m) => ({ ...m, apiKey: e.target.value }))
                        }
                        placeholder="sk-***"
                        className="mt-1 w-full rounded-md border p-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Base URL</label>
                      <input
                        value={mediaGen.baseUrl}
                        onChange={(e) =>
                          setMediaGen((m) => ({
                            ...m,
                            baseUrl: e.target.value
                          }))
                        }
                        placeholder="https://api.openai.com/v1"
                        className="mt-1 w-full rounded-md border p-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">模型名称</label>
                      <input
                        value={mediaGen.model}
                        onChange={(e) =>
                          setMediaGen((m) => ({ ...m, model: e.target.value }))
                        }
                        placeholder="dall-e-3"
                        className="mt-1 w-full rounded-md border p-2 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Video className="h-4 w-4 text-sky-500" />
                  生视频 API
                </div>
                <p className="text-xs text-muted-foreground">
                  填写 OpenAI 兼容的 Base URL，系统会请求{' '}
                  <code className="rounded bg-muted px-1">
                    /videos/generations
                  </code>
                  ，需同步返回视频 URL。
                </p>
                <div>
                  <label className="text-sm font-medium">配置模式</label>
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setMediaGen((m) => ({ ...m, videoMode: 'llm_provider' }))
                      }
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mediaGen.videoMode === 'llm_provider' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
                    >
                      复用 LLM 配置
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setMediaGen((m) => ({ ...m, videoMode: 'dedicated' }))
                      }
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mediaGen.videoMode === 'dedicated' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
                    >
                      独立配置
                    </button>
                  </div>
                </div>
                {mediaGen.videoMode === 'llm_provider' && (
                  <div>
                    <label className="text-sm font-medium">视频生成模型</label>
                    <input
                      value={mediaGen.videoModel}
                      onChange={(e) =>
                        setMediaGen((m) => ({
                          ...m,
                          videoModel: e.target.value
                        }))
                      }
                      placeholder="sora-2"
                      className="mt-1 w-full rounded-md border p-2 text-sm"
                    />
                  </div>
                )}
                {mediaGen.videoMode === 'dedicated' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium">API Key</label>
                      <input
                        type="password"
                        value={mediaGen.videoApiKey}
                        onChange={(e) =>
                          setMediaGen((m) => ({
                            ...m,
                            videoApiKey: e.target.value
                          }))
                        }
                        placeholder="sk-***"
                        className="mt-1 w-full rounded-md border p-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Base URL</label>
                      <input
                        value={mediaGen.videoBaseUrl}
                        onChange={(e) =>
                          setMediaGen((m) => ({
                            ...m,
                            videoBaseUrl: e.target.value
                          }))
                        }
                        placeholder="https://api.openai.com/v1"
                        className="mt-1 w-full rounded-md border p-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">模型名称</label>
                      <input
                        value={mediaGen.videoModel}
                        onChange={(e) =>
                          setMediaGen((m) => ({
                            ...m,
                            videoModel: e.target.value
                          }))
                        }
                        placeholder="sora-2"
                        className="mt-1 w-full rounded-md border p-2 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saveMutation.isPending ? '保存中...' : '保存配置'}
          </button>
        </div>
      )}
    </div>
  );
}
