'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getProfile,
  getOrgMembers,
  inviteTeamMember,
  updateMemberRole,
  removeOrgMember,
  type OrgRole
} from '@/lib/api/settings';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Users, Plus, Shield, UserCog, Eye, Copy } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/utils';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAuth } from '@/providers/AuthProvider';
import { NativeSelect } from '@/components/ui/native-select';

const roleLabels: Record<OrgRole, string> = {
  owner: '所有者',
  admin: '管理员',
  member: '成员',
  viewer: '只读'
};
const roleDescriptions: Record<OrgRole, string> = {
  owner: '组织所有者',
  admin: '全部权限',
  member: '日常操作',
  viewer: '仅查看数据'
};
const roleColors: Record<OrgRole, string> = {
  owner: 'bg-primary/10 text-primary',
  admin: 'bg-primary/10 text-primary',
  member: 'bg-info/10 text-info',
  viewer: 'bg-muted text-muted-foreground'
};
const roleIcons: Record<OrgRole, typeof Shield> = {
  owner: Shield,
  admin: Shield,
  member: UserCog,
  viewer: Eye
};
const assignableRoles: Exclude<OrgRole, 'owner'>[] = [
  'admin',
  'member',
  'viewer'
];

export default function TeamPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] =
    useState<Exclude<OrgRole, 'owner'>>('member');
  const [roleMenuId, setRoleMenuId] = useState<string | null>(null);
  const [lastInvite, setLastInvite] = useState<{
    email: string;
    emailSent: boolean;
    acceptUrl?: string;
  } | null>(null);

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile
  });
  const orgId = profile?.organization?.id;

  const {
    data: members = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => getOrgMembers(orgId as string),
    enabled: Boolean(orgId)
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['org-members', orgId] });
  };

  const inviteMutation = useMutation({
    mutationFn: () =>
      inviteTeamMember(orgId as string, {
        email: inviteEmail,
        role: inviteRole
      }),
    onSuccess: (result) => {
      setLastInvite({
        email: result.email,
        emailSent: result.emailSent,
        acceptUrl: result.acceptUrl
      });
      invalidate();
      setInviteEmail('');
    },
    onError: (err: Error) => toast.error(`邀请失败: ${err.message}`)
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: OrgRole }) =>
      updateMemberRole(orgId as string, id, role),
    onSuccess: () => {
      toast.success('角色已更新');
      invalidate();
      setRoleMenuId(null);
    },
    onError: (err: Error) => toast.error(`更新失败: ${err.message}`)
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeOrgMember(orgId as string, id),
    onSuccess: () => {
      toast.success('成员已移除');
      invalidate();
    },
    onError: (err: Error) => toast.error(`移除失败: ${err.message}`)
  });

  if (error)
    return <ErrorState message="加载团队成员失败" onRetry={() => refetch()} />;

  const canManage = profile?.organizationRole !== 'viewer';

  const openInvite = () => {
    setLastInvite(null);
    setInviteOpen(true);
  };

  const copyInviteLink = async () => {
    if (!lastInvite?.acceptUrl) return;
    try {
      await navigator.clipboard.writeText(lastInvite.acceptUrl);
      toast.success('邀请链接已复制');
    } catch {
      toast.error('复制失败，请手动复制');
    }
  };

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="团队管理"
        actions={
          canManage ? (
            <Button size="sm" onClick={openInvite}>
              <Plus className="mr-1 h-4 w-4" />
              邀请成员
            </Button>
          ) : undefined
        }
      />

      {isLoading || !orgId ? (
        <LoadingState />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold tabular-nums">
                  {members.length}
                </div>
                <div className="text-sm text-muted-foreground">团队成员</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold tabular-nums">
                  {members.filter((m) => m.role === 'admin').length}
                </div>
                <div className="text-sm text-muted-foreground">管理员</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold tabular-nums">
                  {members.filter((m) => m.role === 'member').length}
                </div>
                <div className="text-sm text-muted-foreground">成员</div>
              </CardContent>
            </Card>
          </div>

          <div className="divide-y rounded-lg border bg-card">
            {members.map((member) => {
              const Icon = roleIcons[member.role] ?? Eye;
              const isSelf = member.userId === user?.id;
              const isOwner = member.role === 'owner';
              const canEditRole = canManage && !isOwner && !isSelf;
              const canRemove = canManage && !isOwner && !isSelf;
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Users className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">
                        {member.name}
                        {isSelf && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            （我）
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {member.email}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <button
                        onClick={() =>
                          canEditRole &&
                          setRoleMenuId(
                            roleMenuId === member.id ? null : member.id
                          )
                        }
                        disabled={!canEditRole}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${roleColors[member.role]} ${canEditRole ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                      >
                        <Icon className="h-3 w-3" />
                        {roleLabels[member.role]}
                      </button>
                      {roleMenuId === member.id && (
                        <div className="absolute right-0 top-8 z-10 min-w-[140px] rounded-lg border bg-card p-1 shadow-lg">
                          {assignableRoles.map((r) => (
                            <Button
                              key={r}
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                roleMutation.mutate({ id: member.id, role: r })
                              }
                              className="w-full justify-start"
                            >
                              {roleLabels[r]}
                              <span className="ml-1 text-xs text-muted-foreground">
                                {roleDescriptions[r]}
                              </span>
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      加入于 {formatDateTime(member.joinedAt)}
                    </span>
                    {canRemove && (
                      <Button
                        variant="ghost-destructive"
                        size="xs"
                        onClick={() => {
                          confirm({
                            title: '移除成员',
                            description:
                              '确认移除该成员？移除后该成员将无法访问组织数据。'
                          }).then((ok) => {
                            if (ok) removeMutation.mutate(member.id);
                          });
                        }}
                      >
                        移除
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          {lastInvite ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {lastInvite.emailSent ? '邀请已发送' : '邀请已创建，邮件未发出'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2 text-sm">
                {lastInvite.emailSent ? (
                  <p className="text-muted-foreground">
                    邀请邮件已发送至{' '}
                    <span className="text-foreground">{lastInvite.email}</span>
                    ，对方接受后即可加入组织。邀请有效期 7 天。
                  </p>
                ) : (
                  <>
                    <p className="text-warning">
                      邮件服务暂不可用，请复制下方邀请链接，通过其他方式发给对方：
                    </p>
                    <div className="flex items-center gap-2 rounded-md border bg-muted p-2">
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {lastInvite.acceptUrl}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={copyInviteLink}
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        复制
                      </Button>
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button size="sm" onClick={() => setInviteOpen(false)}>
                  完成
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>邀请团队成员</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <label className="text-sm font-medium">邮箱地址</label>
                  <input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    className="mt-1 w-full rounded-md border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">角色</label>
                  <NativeSelect
                    value={inviteRole}
                    onChange={(e) =>
                      setInviteRole(
                        e.target.value as Exclude<OrgRole, 'owner'>
                      )
                    }
                    className="mt-1 w-full rounded-md border p-2 text-sm"
                  >
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>
                        {roleLabels[r]} — {roleDescriptions[r]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <p className="text-xs text-muted-foreground">
                  对方将通过邮箱收到邀请链接，注册或登录后即可加入。邀请有效期
                  7 天。
                </p>
              </div>
              <DialogFooter>
                <Button
                  size="sm"
                  onClick={() => inviteMutation.mutate()}
                  disabled={!inviteEmail.trim() || inviteMutation.isPending}
                >
                  {inviteMutation.isPending ? '发送中...' : '发送邀请'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </div>
  );
}
