'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlatformAccounts, updatePlatformAccount, createPlatformAccount, validatePlatformAccount, deletePlatformAccount, type PlatformAccount } from '@/lib/api/integrations';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { BrowserLoginDialog } from '@/components/integrations/BrowserLoginDialog';
import { platformLabels, platformIcons, publishModeLabels } from '@/lib/constants';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { formatDate } from '@/lib/utils';
import { useState } from 'react';

const capabilityLabels: Record<string, string> = {
  text_image_publish: '图文发布', video_publish: '视频发布', comment_sync: '评论同步',
  comment_reply: '评论回复', message_sync: '消息同步', auto_reply: '自动回复', data_analysis: '数据分析',
};

const accountStatusLabels: Record<string, string> = {
  active: '已授权', expired: '已过期', disabled: '已禁用', error: '异常',
};

const authTypeLabels: Record<string, string> = {
  official_api: '官方 API', cookie: 'Cookie', oauth: 'OAuth', manual: '手动',
};

const platformAuthOptions: Record<string, string[]> = {
  douyin: ['oauth', 'official_api'],
  xiaohongshu: ['cookie'],
  wechat_official: ['official_api'],
  wechat_channels: ['cookie', 'official_api'],
  baijiahao: ['cookie'],
  zhihu: ['cookie'],
};

type AccountDialog = {
  mode: 'create' | 'edit';
  accountId: string;
  platform: string;
  name: string;
  modeValue: string;
  authType: string;
  accessToken: string;
  refreshToken: string;
  cookie: string;
  appId: string;
  appSecret: string;
  clientKey: string;
  clientSecret: string;
};

const emptyDialog = (mode: 'create' | 'edit'): AccountDialog => ({
  mode, accountId: '', platform: 'douyin', name: '', modeValue: 'official_api',
  authType: '', accessToken: '', refreshToken: '', cookie: '', appId: '', appSecret: '',
  clientKey: '', clientSecret: '',
});

export default function PlatformsPage() {
  const qc = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { data, isLoading } = useQuery({ queryKey: ['platform-accounts'], queryFn: getPlatformAccounts });
  const [dialog, setDialog] = useState<AccountDialog | null>(null);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [validateResult, setValidateResult] = useState<Record<string, unknown> | null>(null);
  const [browserLogin, setBrowserLogin] = useState<{ accountId: string; platform: string } | null>(null);

  const [mutationError, setMutationError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (params: { id: string; [key: string]: unknown }) => updatePlatformAccount(params.id, params),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-accounts'] }); setMutationError(null); },
    onError: (err: Error) => setMutationError(err.message ?? '操作失败'),
  });

  const createMutation = useMutation({
    mutationFn: (params: Record<string, unknown>) => createPlatformAccount(params),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-accounts'] }); setDialog(null); setMutationError(null); },
    onError: (err: Error) => setMutationError(err.message ?? '创建失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePlatformAccount(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-accounts'] }); setMutationError(null); },
    onError: (err: Error) => setMutationError(err.message ?? '删除失败'),
  });

  const handleToggleStatus = (account: PlatformAccount) => {
    const newStatus = account.status === 'active' ? 'disabled' : 'active';
    updateMutation.mutate({ id: account.id, status: newStatus });
  };

  const handleToggleCapability = (accountId: string, capId: string, currentEnabled: boolean) => {
    updateMutation.mutate({ id: accountId, capabilities: [{ id: capId, enabled: !currentEnabled }] });
  };

  const handleValidate = async (accountId: string) => {
    setValidatingId(accountId);
    setValidateResult(null);
    try {
      const result = await validatePlatformAccount(accountId);
      setValidateResult({ ...result, accountId });
      qc.invalidateQueries({ queryKey: ['platform-accounts'] });
    } finally {
      setValidatingId(null);
    }
  };

  const handleSaveDialog = () => {
    if (!dialog) return;
    if (dialog.mode === 'create') {
      const payload: Record<string, unknown> = {
        platform: dialog.platform,
        name: dialog.name,
        mode: dialog.modeValue,
        authType: dialog.authType || null,
      };
      if (dialog.authType === 'official_api' && dialog.platform === 'wechat_official') {
        payload.appId = dialog.appId;
        payload.appSecret = dialog.appSecret;
        payload.metadata = { appId: dialog.appId, appSecret: dialog.appSecret };
      } else if (dialog.authType === 'official_api' && dialog.platform === 'douyin') {
        payload.accessToken = dialog.accessToken;
        payload.refreshToken = dialog.refreshToken;
        payload.metadata = { clientKey: dialog.clientKey, clientSecret: dialog.clientSecret };
      } else if (dialog.authType === 'cookie') {
        payload.cookie = dialog.cookie;
      } else if (dialog.authType === 'oauth' || dialog.authType === 'official_api') {
        payload.accessToken = dialog.accessToken;
        payload.refreshToken = dialog.refreshToken;
      }
      createMutation.mutate(payload);
    } else {
      const payload: Record<string, unknown> = { id: dialog.accountId, name: dialog.name, mode: dialog.modeValue, authType: dialog.authType || null };
      if (dialog.authType === 'official_api' && dialog.platform === 'wechat_official') {
        if (dialog.appId) payload.metadata = { appId: dialog.appId, appSecret: dialog.appSecret };
      } else if (dialog.authType === 'official_api' && dialog.platform === 'douyin') {
        if (dialog.accessToken) payload.accessToken = dialog.accessToken;
        if (dialog.refreshToken) payload.refreshToken = dialog.refreshToken;
        if (dialog.clientKey) payload.metadata = { clientKey: dialog.clientKey, clientSecret: dialog.clientSecret };
      } else if (dialog.authType === 'cookie') {
        payload.cookie = dialog.cookie;
      } else if (dialog.authType === 'oauth' || dialog.authType === 'official_api') {
        if (dialog.accessToken) payload.accessToken = dialog.accessToken;
        if (dialog.refreshToken) payload.refreshToken = dialog.refreshToken;
      }
      updateMutation.mutate({ id: dialog.accountId, ...payload }, { onSuccess: () => setDialog(null) });
    }
  };

  const openEditDialog = (account: PlatformAccount) => {
    const resolvedAuthType = account.authType || (platformAuthOptions[account.platform] ?? [])[0] || '';
    setDialog({
      mode: 'edit',
      accountId: account.id,
      platform: account.platform,
      name: account.name,
      modeValue: account.mode,
      authType: resolvedAuthType,
      accessToken: '',
      refreshToken: '',
      cookie: '',
      appId: (account.metadata as Record<string, unknown>)?.appId as string ?? '',
      appSecret: (account.metadata as Record<string, unknown>)?.appSecret as string ?? '',
      clientKey: (account.metadata as Record<string, unknown>)?.clientKey as string ?? '',
      clientSecret: (account.metadata as Record<string, unknown>)?.clientSecret as string ?? '',
    });
  };

  if (isLoading) return <LoadingState />;

  const d = dialog;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="平台账号" description="管理6大平台账号授权和能力" actions={
        <button onClick={() => setDialog(emptyDialog('create'))} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">创建账号</button>
      } />

      {mutationError && (
        <div className="mb-4 rounded-md bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 flex items-center justify-between">
          <span>{mutationError}</span>
          <button onClick={() => setMutationError(null)} className="text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data?.map((account) => {
          const isActive = account.status === 'active';
          const caps = account.platformCapabilities ?? [];
          const needsSetup = (account.metadata as Record<string, unknown>)?.requiresManualSetup;

          return (
            <div key={account.id} className={`rounded-xl border bg-card p-5 flex flex-col ${needsSetup ? 'border-dashed opacity-70' : ''}`}>
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{platformIcons[account.platform as keyof typeof platformIcons] ?? '🔌'}</span>
                  <div>
                    <h3 className="font-semibold leading-tight">{account.name}</h3>
                    <p className="text-xs text-muted-foreground">{platformLabels[account.platform as keyof typeof platformLabels]}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleStatus(account)}
                  disabled={updateMutation.isPending}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${isActive ? 'bg-teal-600' : 'bg-gray-200'} disabled:opacity-50`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Status + Mode */}
              <div className="flex items-center gap-2 mb-3">
                <StatusBadge status={account.status} label={accountStatusLabels[account.status] ?? account.status} />
                <span className="text-xs text-muted-foreground">{publishModeLabels[account.mode] ?? account.mode}</span>
                {account.authType && <span className="text-xs text-muted-foreground">· {authTypeLabels[account.authType]}</span>}
              </div>

              {/* Capabilities */}
              {caps.length > 0 && (
                <div className="space-y-1.5 mb-3 flex-1">
                  {caps.map((cap) => (
                    <div key={cap.id} className="flex items-center justify-between">
                      <span className="text-xs">{capabilityLabels[cap.capabilityKey] ?? cap.capabilityKey}</span>
                      <button
                        onClick={() => handleToggleCapability(account.id, cap.id, cap.enabled)}
                        disabled={updateMutation.isPending}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${cap.enabled ? 'bg-teal-600' : 'bg-gray-200'} disabled:opacity-50`}
                      >
                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${cap.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Validate result */}
              {validateResult?.accountId === account.id && (
                <div className={`mb-2 rounded-md p-2 text-xs ${validateResult.valid ? 'bg-green-50 dark:bg-green-950 text-green-700' : 'bg-red-50 dark:bg-red-950 text-red-700'}`}>
                  {validateResult.valid ? '凭证有效' : `无效: ${validateResult.error ?? '未知错误'}`}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between border-t pt-3 mt-auto">
                <div className="text-xs text-muted-foreground">
                  {typeof account.lastHealthCheckAt === 'string' ? `检查: ${formatDate(account.lastHealthCheckAt)}` : '未检查'}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setBrowserLogin({ accountId: account.id, platform: account.platform })} className="text-xs text-green-600 hover:underline">
                    扫码登录
                  </button>
                  <button onClick={() => handleValidate(account.id)} disabled={validatingId === account.id} className="text-xs text-blue-600 hover:underline disabled:opacity-50">
                    {validatingId === account.id ? '验证中...' : '验证'}
                  </button>
                  <button onClick={() => openEditDialog(account)} className="text-xs text-blue-600 hover:underline">编辑</button>
                  <button onClick={() => { confirm({ title: '删除账号', description: '确定删除此平台账号？相关发布任务不会受影响。' }).then(ok => { if (ok) deleteMutation.mutate(account.id); }); }} className="text-xs text-red-600 hover:underline dark:text-red-400">删除</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Dialog */}
      {d && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDialog(null)}>
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{d.mode === 'create' ? '创建平台账号' : '编辑账号配置'}</h3>
            <div className="space-y-4">
              {/* Platform (only on create) */}
              {d.mode === 'create' && (
                <div>
                  <label className="text-sm font-medium">平台</label>
                  <select value={d.platform} onChange={(e) => {
                    const p = e.target.value;
                    const authOptions = platformAuthOptions[p] ?? [];
                    setDialog((prev) => prev ? { ...prev, platform: p, authType: authOptions[0] ?? '', name: `${platformLabels[p as keyof typeof platformLabels] ?? p} 账号` } : prev);
                  }} className="mt-1 w-full rounded-md border p-2 text-sm">
                    <option value="douyin">抖音</option>
                    <option value="xiaohongshu">小红书</option>
                    <option value="wechat_official">微信公众号</option>
                    <option value="wechat_channels">微信视频号</option>
                    <option value="baijiahao">百家号</option>
                    <option value="zhihu">知乎</option>
                  </select>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">账号名称</label>
                <input value={d.name} onChange={(e) => setDialog((prev) => prev ? { ...prev, name: e.target.value } : prev)} className="mt-1 w-full rounded-md border p-2 text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">发布模式</label>
                  <select value={d.modeValue} onChange={(e) => setDialog((prev) => prev ? { ...prev, modeValue: e.target.value } : prev)} className="mt-1 w-full rounded-md border p-2 text-sm">
                    <option value="official_api">官方 API</option>
                    <option value="browser_assist">浏览器辅助</option>
                    <option value="manual_confirm">人工确认</option>
                    <option value="manual_import">手动导入</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">认证方式</label>
                  <select value={d.authType} onChange={(e) => setDialog((prev) => prev ? { ...prev, authType: e.target.value } : prev)} className="mt-1 w-full rounded-md border p-2 text-sm">
                    <option value="">未设置</option>
                    {(platformAuthOptions[d.platform] ?? []).map((t) => (
                      <option key={t} value={t}>{authTypeLabels[t]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* WeChat Official — AppID/AppSecret */}
              {d.authType === 'official_api' && d.platform === 'wechat_official' && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">微信公众号 API 配置</h4>
                  <div>
                    <label className="text-xs font-medium">AppID</label>
                    <input value={d.appId} onChange={(e) => setDialog((prev) => prev ? { ...prev, appId: e.target.value } : prev)} placeholder="wx..." className="mt-1 w-full rounded-md border bg-background p-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">AppSecret</label>
                    <input type="password" value={d.appSecret} onChange={(e) => setDialog((prev) => prev ? { ...prev, appSecret: e.target.value } : prev)} placeholder="输入 AppSecret..." className="mt-1 w-full rounded-md border bg-background p-2 text-sm" />
                  </div>
                  <p className="text-xs text-muted-foreground">在微信公众平台 → 开发 → 基本配置中获取 AppID 和 AppSecret。</p>
                </div>
              )}

              {/* Douyin Official API — ClientKey + AccessToken */}
              {d.authType === 'official_api' && d.platform === 'douyin' && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">抖音开放平台 API 配置</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium">Client Key</label>
                      <input value={d.clientKey} onChange={(e) => setDialog((prev) => prev ? { ...prev, clientKey: e.target.value } : prev)} placeholder="aw..." className="mt-1 w-full rounded-md border bg-background p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Client Secret</label>
                      <input type="password" value={d.clientSecret} onChange={(e) => setDialog((prev) => prev ? { ...prev, clientSecret: e.target.value } : prev)} placeholder="输入 Client Secret" className="mt-1 w-full rounded-md border bg-background p-2 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Access Token</label>
                    <input type="password" value={d.accessToken} onChange={(e) => setDialog((prev) => prev ? { ...prev, accessToken: e.target.value } : prev)} placeholder="通过 OAuth 换取的 access_token" className="mt-1 w-full rounded-md border bg-background p-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Refresh Token（可选）</label>
                    <input type="password" value={d.refreshToken} onChange={(e) => setDialog((prev) => prev ? { ...prev, refreshToken: e.target.value } : prev)} placeholder="refresh_token，用于自动续期" className="mt-1 w-full rounded-md border bg-background p-2 text-sm" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    在 <a href="https://open.douyin.com/platform/doc" target="_blank" rel="noreferrer" className="underline">抖音开放平台</a> → 我的应用 → 应用详情中获取 Client Key 和 Secret；Access Token 通过 OAuth 授权码流程换取，需申请 <code className="bg-muted px-1 rounded">comment.list</code>、<code className="bg-muted px-1 rounded">im.message.list</code> 权限。
                  </p>
                </div>
              )}

              {/* OAuth / Official API — Token (non-douyin, non-wechat) */}
              {(d.authType === 'oauth' || (d.authType === 'official_api' && d.platform !== 'wechat_official' && d.platform !== 'douyin')) && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">{d.authType === 'oauth' ? 'OAuth' : '官方 API'} 配置</h4>
                  <div>
                    <label className="text-xs font-medium">Access Token</label>
                    <input type="password" value={d.accessToken} onChange={(e) => setDialog((prev) => prev ? { ...prev, accessToken: e.target.value } : prev)} placeholder="输入 Access Token..." className="mt-1 w-full rounded-md border bg-background p-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Refresh Token（可选）</label>
                    <input type="password" value={d.refreshToken} onChange={(e) => setDialog((prev) => prev ? { ...prev, refreshToken: e.target.value } : prev)} placeholder="输入 Refresh Token..." className="mt-1 w-full rounded-md border bg-background p-2 text-sm" />
                  </div>
                </div>
              )}

              {/* Cookie */}
              {d.authType === 'cookie' && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Cookie 配置</h4>
                  <div>
                    <label className="text-xs font-medium">Cookie 值</label>
                    <textarea value={d.cookie} onChange={(e) => setDialog((prev) => prev ? { ...prev, cookie: e.target.value } : prev)} rows={3} placeholder="从浏览器中复制完整的 Cookie 值..." className="mt-1 w-full rounded-md border bg-background p-2 text-sm" />
                  </div>
                  <p className="text-xs text-muted-foreground">在浏览器中登录平台后，打开开发者工具 → Network → 复制任意请求的 Cookie 头。</p>
                </div>
              )}

              {/* Manual */}
              {d.authType === 'manual' && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">手动模式下由运营人员自行操作，无需配置凭证。</p>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDialog(null)} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">取消</button>
              <button
                onClick={handleSaveDialog}
                disabled={createMutation.isPending || updateMutation.isPending || !d.name || !d.platform}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              >
                {(createMutation.isPending || updateMutation.isPending) ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Browser Login Dialog */}
      {browserLogin && (
        <BrowserLoginDialog
          accountId={browserLogin.accountId}
          platform={browserLogin.platform}
          open={!!browserLogin}
          onClose={() => setBrowserLogin(null)}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}
