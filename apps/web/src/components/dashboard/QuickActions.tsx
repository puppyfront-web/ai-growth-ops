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
  },
  {
    icon: Search,
    label: '运行调研',
    href: '/research/new',
  },
  {
    icon: Send,
    label: '发布管理',
    href: '/publish',
  },
  {
    icon: MessageSquare,
    label: '评论私信',
    href: '/conversations',
  },
  { icon: Users, label: '线索管理', href: '/leads' },
  {
    icon: FileText,
    label: '数据复盘',
    href: '/analytics',
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
          <Zap className="h-4 w-4 text-muted-foreground" />
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
                <action.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs">{action.label}</span>
              </Link>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
