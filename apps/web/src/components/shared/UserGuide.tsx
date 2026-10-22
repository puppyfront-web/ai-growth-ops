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
  '/dashboard': '今日待办与经营指标，一天的工作从这里开始。',
  '/prospecting': '按理想客户画像自动挖掘潜在客户，线索自动进入跟进池。',
  '/customers': '统一管理客户档案、跟进记录与转化状态。',
  '/leads': '跟进平台线索，分配负责人并推进转化。',
  '/outreach': '多步触达序列与退订名单，发送前统一风控。',
  '/forms': '公开表单收集线索，提交后自动去重与分配。',
  '/deals/pipeline': '按销售阶段拖拽推进商机，金额与逾期一目了然。',
  '/analytics/funnel': '从内容到成交的统一经营漏斗。',
  '/analytics/efficiency': '记录成本，查看 CPL、CAC、ROI 与收入归因。',
  '/analytics/lead': '查看获客漏斗与转化数据，持续优化获客策略。',
  '/experiments': '内容与触达的 A/B 分流实验，样本不足不宣布胜出。',
  '/content': 'AI 辅助批量创作、改编多平台运营内容。',
  '/publish': '将内容一键发布或定时发布到已连接的平台。',
  '/conversations': '集中处理各平台的评论与私信，及时互动促转化。',
  '/notifications': '任务完成、线索分配与 SLA 超时提醒。',
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
    if (!user?.id) return;
    // Guide completion is per-user: switching accounts must close a guide
    // auto-opened for the previous user.
    setOpen(hasCompletedUserGuide(user.id) ? false : true);
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="功能引导"
    >
      <div className="flex max-h-[85vh] w-full max-w-[560px] flex-col rounded-xl border bg-card shadow-xl">
        <div className="p-6 pb-0">
          <h3 className="text-lg font-semibold tracking-tight">
            欢迎使用 AI Growth Ops
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            自动获客、AI 内容创作、多平台发布与互动转化。从这些模块开始：
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {visibleModules.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={dismiss}
                className="flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-accent"
              >
                <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {item.label}
                  </span>
                  <span className="block text-xs leading-relaxed text-muted-foreground">
                    {MODULE_DESCRIPTIONS[item.href] ?? '常用功能入口。'}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t p-6 pt-4">
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
