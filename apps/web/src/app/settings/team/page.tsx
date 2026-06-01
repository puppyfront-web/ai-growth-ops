'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Users, Plus, Shield, Edit, Eye } from 'lucide-react';

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
  joinedAt: string;
};

const roleLabels = { admin: '管理员', operator: '运营', viewer: '只读' };
const roleColors = { admin: 'bg-purple-100 text-purple-700', operator: 'bg-blue-100 text-blue-700', viewer: 'bg-gray-100 text-gray-700' };
const roleIcons = { admin: Shield, operator: Edit, viewer: Eye };

const mockMembers: TeamMember[] = [
  { id: '1', name: '管理员', email: 'admin@example.com', role: 'admin', joinedAt: '2026-01-01' },
  { id: '2', name: '运营人员', email: 'operator@example.com', role: 'operator', joinedAt: '2026-03-15' },
];

export default function TeamPage() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const members = mockMembers;

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
          const Icon = roleIcons[member.role];
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
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${roleColors[member.role]}`}>
                  <Icon className="h-3 w-3" />
                  {roleLabels[member.role]}
                </span>
                <span className="text-xs text-muted-foreground">加入于 {member.joinedAt}</span>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>邀请团队成员</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><label className="text-sm font-medium">邮箱地址</label><input placeholder="colleague@example.com" className="mt-1 w-full rounded-md border p-2 text-sm" /></div>
            <div>
              <label className="text-sm font-medium">角色</label>
              <select className="mt-1 w-full rounded-md border p-2 text-sm">
                <option value="operator">运营 — 日常操作</option>
                <option value="viewer">只读 — 查看数据</option>
              </select>
            </div>
          </div>
          <DialogFooter><Button size="sm">发送邀请</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
