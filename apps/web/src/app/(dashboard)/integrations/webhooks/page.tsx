'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWebhooks, createWebhook, deleteWebhook } from '@/lib/api/settings';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Webhook, Plus, Trash2, Zap, Send, Users } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

const webhookEvents = [
  { value: 'publish.completed', label: '发布完成', icon: Send, desc: '内容成功发布到平台时触发' },
  { value: 'lead.created', label: '线索创建', icon: Users, desc: '新线索被创建时触发' },
  { value: 'interaction.received', label: '收到互动', icon: Zap, desc: '收到新评论或私信时触发' },
];

export default function WebhooksPage() {
  const qc = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [addOpen, setAddOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const { data: webhooks = [], isLoading, error, refetch } = useQuery({
    queryKey: ['webhooks'],
    queryFn: getWebhooks,
  });

  const createMutation = useMutation({
    mutationFn: () => createWebhook({ url: webhookUrl, events: selectedEvents }),
    onSuccess: () => {
      toast.success('Webhook 已添加');
      qc.invalidateQueries({ queryKey: ['webhooks'] });
      setAddOpen(false);
      setWebhookUrl('');
      setSelectedEvents([]);
    },
    onError: (err: Error) => toast.error(`添加失败: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWebhook(id),
    onSuccess: () => {
      toast.success('Webhook 已删除');
      qc.invalidateQueries({ queryKey: ['webhooks'] });
    },
    onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
  });

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) => prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]);
  };

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message="加载 Webhook 失败" onRetry={() => refetch()} />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="Webhook 配置" description="配置 Webhook 回调" actions={
        <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="mr-1 h-4 w-4" />添加 Webhook</Button>
      } />

      {/* Supported events */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-base font-semibold">支持的事件</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {webhookEvents.map((ev) => (
              <div key={ev.value} className="rounded-lg border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <ev.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{ev.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{ev.desc}</p>
                <code className="mt-1 block rounded bg-muted px-1.5 py-0.5 text-[10px]">{ev.value}</code>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Webhook list */}
      {webhooks.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">暂无 Webhook 配置</div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <div key={wh.id} className="flex items-center justify-between rounded-lg border bg-card p-4">
              <div className="flex items-center gap-3 min-w-0">
                <Webhook className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{wh.url}</div>
                  <div className="flex items-center gap-1 mt-1">
                    {wh.events.map((ev) => (
                      <span key={ev} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{ev}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${wh.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                  {wh.status === 'active' ? '已启用' : '已禁用'}
                </span>
                <span className="text-xs text-muted-foreground">{formatDate(wh.createdAt)}</span>
                <button onClick={() => { confirm({ title: '删除 Webhook', description: '确认删除该 Webhook？删除后将停止接收事件通知。' }).then(ok => { if (ok) deleteMutation.mutate(wh.id); }); }}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>添加 Webhook</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">回调 URL</label>
              <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://example.com/webhook" className="mt-1 w-full rounded-md border p-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">订阅事件</label>
              <div className="mt-2 space-y-2">
                {webhookEvents.map((ev) => (
                  <label key={ev.value} className="flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer hover:bg-accent/50">
                    <input type="checkbox" checked={selectedEvents.includes(ev.value)} onChange={() => toggleEvent(ev.value)} className="rounded" />
                    <div>
                      <div className="text-sm font-medium">{ev.label}</div>
                      <div className="text-xs text-muted-foreground">{ev.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => createMutation.mutate()} disabled={!webhookUrl.trim() || selectedEvents.length === 0 || createMutation.isPending}>
              {createMutation.isPending ? '添加中...' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </div>
  );
}
