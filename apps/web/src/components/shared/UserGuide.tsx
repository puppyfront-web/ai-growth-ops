'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { navItems } from '@/components/layout/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface GuideStep {
  id: string;
  selector?: string;
  title: string;
  description: string;
}

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

function buildSteps(): GuideStep[] {
  const navSteps = navItems
    .filter((item) => !item.hidden)
    .map((item) => ({
      id: `nav-${item.href}`,
      selector: `[data-user-guide-tour="nav-${item.href}"]`,
      title: item.label,
      description: MODULE_DESCRIPTIONS[item.href] ?? '常用功能入口。'
    }));

  return [
    {
      id: 'welcome',
      title: '欢迎使用 AI Growth Ops',
      description:
        '这是一站式 AI 增长运营平台：自动获客、AI 内容创作、多平台发布与互动转化。跟着这份引导快速了解核心功能。'
    },
    {
      id: 'sidebar',
      selector: '[data-user-guide-tour="sidebar"]',
      title: '主导航',
      description: '左侧导航是所有功能模块的入口，点击即可随时切换。'
    },
    ...navSteps,
    {
      id: 'global-search',
      selector: '[data-user-guide-tour="global-search"]',
      title: '全局搜索',
      description: '快速定位客户、内容与任务，无需在菜单间来回查找。'
    },
    {
      id: 'topbar-actions',
      selector: '[data-user-guide-tour="topbar-actions"]',
      title: '主题、通知与账号',
      description:
        '切换明暗主题、查看通知；点击右侧头像菜单可随时重新打开这份功能引导。'
    },
    {
      id: 'finish',
      title: '引导完成',
      description:
        '你已经了解全部核心模块。之后想重看，随时点击头像菜单中的「功能引导」。'
    }
  ];
}

interface TooltipPosition {
  top: number;
  left: number;
  width: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

const GUIDE_CARD_MAX_WIDTH = 600;

function computeTooltipPosition(rect: DOMRect): TooltipPosition {
  const width = Math.min(GUIDE_CARD_MAX_WIDTH, window.innerWidth - 32);
  const gap = 12;
  const fitsRight =
    rect.width <= 260 && rect.right + gap + width <= window.innerWidth - 16;
  if (fitsRight) {
    return {
      left: rect.right + gap,
      top: clamp(
        rect.top + rect.height / 2 - 100,
        16,
        window.innerHeight - 236
      ),
      width
    };
  }
  const centeredLeft = clamp(
    rect.left + rect.width / 2 - width / 2,
    16,
    Math.max(16, window.innerWidth - width - 16)
  );
  if (window.innerHeight - rect.bottom > 250) {
    return { left: centeredLeft, top: rect.bottom + gap, width };
  }
  return { left: centeredLeft, top: Math.max(16, rect.top - 236), width };
}

export function UserGuide() {
  const { user } = useAuth();
  const steps = useMemo(buildSteps, []);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user?.id || hasCompletedUserGuide(user.id)) {
      setStepIndex(null);
      return;
    }
    setStepIndex(0);
  }, [user?.id]);

  useEffect(() => {
    const reopen = () => setStepIndex(0);
    window.addEventListener(USER_GUIDE_REOPEN_EVENT, reopen);
    return () => window.removeEventListener(USER_GUIDE_REOPEN_EVENT, reopen);
  }, []);

  const finish = useCallback(() => {
    if (user?.id) {
      try {
        localStorage.setItem(getUserGuideStorageKey(user.id), 'true');
      } catch {
        // Closing the guide must not depend on storage availability.
      }
    }
    setStepIndex(null);
  }, [user?.id]);

  useEffect(() => {
    if (stepIndex == null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stepIndex, finish]);

  const step = stepIndex == null ? null : steps[stepIndex];

  useEffect(() => {
    if (stepIndex == null) return;
    cardRef.current
      ?.querySelector<HTMLButtonElement>('[data-user-guide-primary]')
      ?.focus();
  }, [stepIndex]);

  useEffect(() => {
    const selector = step?.selector;
    if (!selector) {
      setTargetRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el || el.offsetParent === null) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[UserGuide] anchor not found: ${selector}`);
        }
        setTargetRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setTargetRect(r.width === 0 && r.height === 0 ? null : r);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step?.selector]);

  if (!step || stepIndex == null) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;
  const goNext = () => (isLast ? finish() : setStepIndex(stepIndex + 1));
  const goPrev = () => setStepIndex(Math.max(0, stepIndex - 1));
  const keepFocusInDialog = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !cardRef.current) return;
    const buttons = Array.from(
      cardRef.current.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)'
      )
    );
    const first = buttons[0];
    const last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const card = (
    <div
      ref={cardRef}
      className="w-full max-w-[600px] rounded-xl border bg-card p-5 shadow-xl"
    >
      <p className="text-xs font-medium text-primary">
        第 {stepIndex + 1} / {steps.length} 步
      </p>
      <h3 className="mt-1 text-base font-semibold">{step.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {step.description}
      </p>

      <div className="mt-3 flex items-center gap-1.5">
        {steps.map((s, i) => (
          <span
            key={s.id}
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              i === stepIndex
                ? 'bg-primary'
                : i < stepIndex
                  ? 'bg-primary/40'
                  : 'bg-muted'
            )}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={finish}>
          跳过引导
        </Button>
        <div className="flex items-center gap-2">
          {!isFirst && (
            <Button variant="outline" size="sm" onClick={goPrev}>
              上一步
            </Button>
          )}
          <Button size="sm" onClick={goNext} data-user-guide-primary>
            {isFirst ? '开始引导' : isLast ? '完成' : '下一步'}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
      onKeyDown={keepFocusInDialog}
    >
      {targetRect ? (
        <>
          <div
            className="pointer-events-none fixed rounded-lg border-2 border-primary transition-all duration-300"
            style={{
              top: targetRect.top - 4,
              left: targetRect.left - 4,
              width: targetRect.width + 8,
              height: targetRect.height + 8,
              boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.6)'
            }}
          />
          <div className="fixed" style={computeTooltipPosition(targetRect)}>
            {card}
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 p-4">
          {card}
        </div>
      )}
    </div>
  );
}
