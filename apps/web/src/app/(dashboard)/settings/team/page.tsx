'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTeamMembers, inviteTeamMember, updateMemberRole, removeTeamMember } from '@/lib/api/settings';
import type { TeamMember } from '@/lib/api/settings';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Users, Plus, Shield, Edit, Eye } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

const roleLabels = { admin: '管理员', operator: '运营', viewer: '只读' };
const roleColors = { admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300', operator: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', viewer: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };
const roleIcons = { admin: Shield, operator: Edit, viewer: Eye };

export default function TeamPage() {
  const qc = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('operator');
  const [roleMenuId, setRoleMenuId] = useState<string | null>(null);

  const { data: members = [], isLoading, error, refetch } = useQuery({
    queryKey: ['team-members'],
    queryFn: getTeamMembers,
  });

  const inviteMutation = useMutation({
    mutationFn: () => inviteTeamMember({ email: inviteEmail, role: inviteRole }),
    onSuccess: () => {
      toast.success('成员邀请成功');
      qc.invalidateQueries({ queryKey: ['team-members'] });
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('operator');
    },
    onError: (err: Error) => toast.error(`邀请失败: ${err.message}`),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => updateMemberRole(id, role),
    onSuccess: () => {
      toast.success('角色已更新');
      qc.invalidateQueries({ queryKey: ['team-members'] });
      setRoleMenuId(null);
    },
    onError: (err: Error) => toast.error(`更新失败: ${err.message}`),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeTeamMember(id),
    onSuccess: () => {
      toast.success('成员已移除');
      qc.invalidateQueries({ queryKey: ['team-members'] });
    },
    onError: (err: Error) => toast.error(`移除失败: ${err.message}`),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message="加载团队成员失败" onRetry={() => refetch()} />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="团队管理" description="管理团队成员和权限" actions={
        <Button size="sm" onClick={() => setInviteOpen(true)}><Plus className="mr-1 h-4 w-4" />邀请成员</Button>
      } />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-6">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{members.length}</div><div className="text-sm text-muted-foreground">团队成员</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{members.filter((m) => m.role === 'admin').length}</div><div className="text-sm text-muted-foreground">管理员</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{members.filter((m) => m.role === 'operator').length}</div><div className="text-sm text-muted-foreground">运营人员</div></CardContent></Card>
      </div>

      <div className="space-y-3">
        {members.map((member) => {
          const Icon = roleIcons[member.role as keyof typeof roleIcons] ?? Eye;
          return (
            <div key={member.id} className="flex items-center justify-between rounded-lg border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-sm font-medium">{member.name}</div>
                  <div className="text-xs text-muted-foreground">{member.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <button
                    onClick={() => setRoleMenuId(roleMenuId === member.id ? null : member.id)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${roleColors[member.role as keyof typeof roleColors] ?? ''}`}
                  >
                    <Icon className="h-3 w-3" />
                    {roleLabels[member.role as keyof typeof roleLabels] ?? member.role}
                  </button>
                  {roleMenuId === member.id && (
                    <div className="absolute right-0 top-8 z-10 rounded-lg border bg-card shadow-lg p-1 min-w-[120px]">
                      {(['admin', 'operator', 'viewer'] as const).map((r) => (
                        <button key={r} onClick={() => roleMutation.mutate({ id: member.id, role: r })}
                          className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-accent">
                          {roleLabels[r]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">加入于 {formatDate(member.createdAt)}</span>
                <button onClick={() => { confirm({ title: '移除成员', description: '确认移除该成员？移除后该成员将无法访问组织数据。' }).then(ok => { if (ok) removeMutation.mutate(member.id); }); }}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-500 text-xs">
                  移除
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>邀请团队成员</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">邮箱地址</label>
              <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@example.com" className="mt-1 w-full rounded-md border p-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">角色</label>
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="mt-1 w-full rounded-md border p-2 text-sm">
                <option value="operator">运营 — 日常操作</option>
                <option value="viewer">只读 — 查看数据</option>
                <option value="admin">管理员 — 全部权限</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => inviteMutation.mutate()} disabled={!inviteEmail.trim() || inviteMutation.isPending}>
              {inviteMutation.isPending ? '邀请中...' : '发送邀请'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </div>
  );
}
