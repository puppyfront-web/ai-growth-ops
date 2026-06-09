'use client';

import Link from 'next/link';
import {
  Plus,
  Search,
  Send,
  Users,
  MessageSquare,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap } from 'lucide-react';

const actions = [
  {
    icon: Plus,
    label: '创建内容',
    href: '/content/new',
    color: 'text-blue-500'
  },
  {
    icon: Search,
    label: '运行调研',
    href: '/research/new',
    color: 'text-purple-500'
  },
  {
    icon: Send,
    label: '发布管理',
    href: '/publish',
    color: 'text-emerald-500'
  },
  {
    icon: MessageSquare,
    label: '评论私信',
    href: '/conversations',
    color: 'text-amber-500'
  },
  { icon: Users, label: '线索管理', href: '/leads', color: 'text-rose-500' },
  {
    icon: FileText,
    label: '数据复盘',
    href: '/analytics',
    color: 'text-cyan-500'
  }
];

export type QuickActionsProps = {
  className?: string;
};

export function QuickActions({ className }: QuickActionsProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <CardTitle className="text-base font-semibold">快捷操作</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant="outline"
              size="sm"
              className="h-auto justify-start gap-2 py-2"
              asChild
            >
              <Link href={action.href}>
                <action.icon className={`h-4 w-4 ${action.color}`} />
                <span className="text-xs">{action.label}</span>
              </Link>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
