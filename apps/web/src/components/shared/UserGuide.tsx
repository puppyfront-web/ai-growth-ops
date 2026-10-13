'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/providers/AuthProvider';
import { navItems } from '@/components/layout/navigation';
import { Button } from '@/components/ui/button';

export const USER_GUIDE_REOPEN_EVENT = 'user-guide:reopen';

export function reopenUserGuide() {
  window.dispatchEvent(new CustomEvent(USER_GUIDE_REOPEN_EVENT));
}

const GUIDE_VERSION = 'v1';

const MODULE_DESCRIPTIONS: Record<string, string> = {
  '/prospecting': '按理想客户画像自动挖掘潜在客户，线索自动进入跟进池。',
  '/customers': '统一管理客户档案、跟进记录与转化状态。',
  '/content': 'AI 辅助批量创作、改编多平台运营内容。',
  '/publish': '将内容一键发布或定时发布到已连接的平台。',
  '/conversations': '集中处理各平台的评论与私信，及时互动促转化。',
  '/analytics/lead': '查看获客漏斗与转化数据，持续优化获客策略。',
  '/integrations': '连接社交媒体账号与第三方服务，开启自动化能力。',
  '/settings': '管理团队成员、角色权限与系统参数。'
};

export function getUserGuideStorageKey(userId: string): string {
  return `user-guide:${GUIDE_VERSION}:${userId}`;
}

export function hasCompletedUserGuide(userId: string): boolean {
  try {
    return localStorage.getItem(getUserGuideStorageKey(userId)) === 'true';
  } catch {
    return false;
  }
}

const visibleModules = navItems.filter((item) => !item.hidden);

export function UserGuide() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!user?.id || hasCompletedUserGuide(user.id)) return;
    setOpen(true);
  }, [user?.id]);

  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener(USER_GUIDE_REOPEN_EVENT, reopen);
    return () => window.removeEventListener(USER_GUIDE_REOPEN_EVENT, reopen);
  }, []);

  const dismiss = useCallback(() => {
    if (user?.id) {
      try {
        localStorage.setItem(getUserGuideStorageKey(user.id), 'true');
      } catch {
        // Closing the guide must not depend on storage availability.
      }
    }
    setOpen(false);
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="功能引导"
    >
      <div className="w-full max-w-[560px] rounded-xl border bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold tracking-tight">
          欢迎使用 AI Growth Ops
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          自动获客、AI 内容创作、多平台发布与互动转化。从这些模块开始：
        </p>

        <div className="mt-4 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {visibleModules.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={dismiss}
              className="flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-accent"
            >
              <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  {MODULE_DESCRIPTIONS[item.href] ?? '常用功能入口。'}
                </span>
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            随时可在头像菜单中重新打开此引导
          </p>
          <Button ref={primaryRef} size="sm" onClick={dismiss}>
            开始使用
          </Button>
        </div>
      </div>
    </div>
  );
}
