'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLeadSinkConfig, updateLeadSinkConfig, listLeads } from '@/lib/api/leads';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { syncStatusLabels, platformLabels } from '@/lib/constants';
import { Database, RefreshCw } from 'lucide-react';

export default function LeadSyncPage() {
  const qc = useQueryClient();

  // Feishu config
  const { data: feishuConfig, isLoading: loadingFeishu } = useQuery({
    queryKey: queryKeys.leads.sinks('feishu'),
    queryFn: () => getLeadSinkConfig('feishu'),
  });
  const [feishuAppId, setFeishuAppId] = useState('');
  const [feishuAppSecret, setFeishuAppSecret] = useState('');
  const [feishuAppToken, setFeishuAppToken] = useState('');
  const [feishuTableId, setFeishuTableId] = useState('');

  useEffect(() => {
    if (feishuConfig) {
      setFeishuAppId(String(feishuConfig.appId ?? ''));
      setFeishuAppSecret(String(feishuConfig.appSecret ?? ''));
      setFeishuAppToken(String(feishuConfig.appToken ?? ''));
      setFeishuTableId(String(feishuConfig.tableId ?? ''));
    }
  }, [feishuConfig]);

  const saveFeishu = useMutation({
    mutationFn: () => updateLeadSinkConfig('feishu', { appId: feishuAppId, appSecret: feishuAppSecret, appToken: feishuAppToken, tableId: feishuTableId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.leads.sinks('feishu') }),
  });

  // WeCom config
  const { data: wecomConfig, isLoading: loadingWecom } = useQuery({
    queryKey: queryKeys.leads.sinks('wecom'),
    queryFn: () => getLeadSinkConfig('wecom'),
  });
  const [wecomCorpId, setWecomCorpId] = useState('');
  const [wecomSecret, setWecomSecret] = useState('');
  const [wecomAgentId, setWecomAgentId] = useState('');

  useEffect(() => {
    if (wecomConfig) {
      setWecomCorpId(String(wecomConfig.corpId ?? ''));
      setWecomSecret(String(wecomConfig.secret ?? ''));
      setWecomAgentId(String(wecomConfig.agentId ?? ''));
    }
  }, [wecomConfig]);

  const saveWecom = useMutation({
    mutationFn: () => updateLeadSinkConfig('wecom', { corpId: wecomCorpId, secret: wecomSecret, agentId: wecomAgentId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.leads.sinks('wecom') }),
  });

  // Recent sync activity
  const { data: leadsData } = useQuery({
    queryKey: queryKeys.leads.all,
    queryFn: () => listLeads(),
  });
  const leads = leadsData?.items ?? [];

  const syncedLeads = leads
    .filter((l) => (l.externalMappings ?? []).length > 0)
    .slice(0, 10);

  if (loadingFeishu || loadingWecom) return <LoadingState rows={4} />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="线索同步" description="管理飞书和企微的线索同步状态" />

      <div className="max-w-3xl space-y-6">
        <Tabs defaultValue="feishu">
          <TabsList>
            <TabsTrigger value="feishu">飞书同步</TabsTrigger>
            <TabsTrigger value="wecom">企微同步</TabsTrigger>
          </TabsList>

          <TabsContent value="feishu">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-500" />
                  <CardTitle className="text-base font-semibold">飞书多维表格配置</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm font-medium">App ID</label>
                  <input value={feishuAppId} onChange={(e) => setFeishuAppId(e.target.value)} className="mt-1 w-full rounded-md border p-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">App Secret</label>
                  <input value={feishuAppSecret} onChange={(e) => setFeishuAppSecret(e.target.value)} type="password" className="mt-1 w-full rounded-md border p-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">多维表格 App Token</label>
                  <input value={feishuAppToken} onChange={(e) => setFeishuAppToken(e.target.value)} className="mt-1 w-full rounded-md border p-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Table ID</label>
                  <input value={feishuTableId} onChange={(e) => setFeishuTableId(e.target.value)} className="mt-1 w-full rounded-md border p-2 text-sm" />
                </div>
                {feishuConfig?.lastSyncAt && (
                  <div className="text-xs text-muted-foreground">最近同步: {formatDate(feishuConfig.lastSyncAt)}</div>
                )}
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${feishuConfig?.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                    {feishuConfig?.enabled ? '已启用' : '未启用'}
                  </span>
                  <button onClick={() => saveFeishu.mutate()} disabled={saveFeishu.isPending} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
                    {saveFeishu.isPending ? '保存中...' : '保存配置'}
                  </button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wecom">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-green-500" />
                  <CardTitle className="text-base font-semibold">企业微信配置</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Corp ID</label>
                  <input value={wecomCorpId} onChange={(e) => setWecomCorpId(e.target.value)} className="mt-1 w-full rounded-md border p-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Secret</label>
                  <input value={wecomSecret} onChange={(e) => setWecomSecret(e.target.value)} type="password" className="mt-1 w-full rounded-md border p-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Agent ID</label>
                  <input value={wecomAgentId} onChange={(e) => setWecomAgentId(e.target.value)} className="mt-1 w-full rounded-md border p-2 text-sm" />
                </div>
                {wecomConfig?.lastSyncAt && (
                  <div className="text-xs text-muted-foreground">最近同步: {formatDate(wecomConfig.lastSyncAt)}</div>
                )}
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${wecomConfig?.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                    {wecomConfig?.enabled ? '已启用' : '未启用'}
                  </span>
                  <button onClick={() => saveWecom.mutate()} disabled={saveWecom.isPending} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
                    {saveWecom.isPending ? '保存中...' : '保存配置'}
                  </button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Recent sync activity */}
        {syncedLeads.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">最近同步活动</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {syncedLeads.map((lead) => {
                  const mapping = lead.externalMappings?.[0];
                  return (
                    <div key={lead.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{lead.externalUserName ?? '未知'}</span>
                        {mapping && (
                          <span className="text-xs text-muted-foreground">
                            → {mapping.sinkType === 'lark' ? '飞书' : '企微'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {mapping?.syncedAt && (
                          <span className="text-xs text-muted-foreground">{formatDate(mapping.syncedAt)}</span>
                        )}
                        <StatusBadge status="synced" label="已同步" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
