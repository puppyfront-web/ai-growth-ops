'use client';

import { Button } from '@/components/ui/button';

interface BoundAccountLoginNoticeProps {
  platformLabel: string;
  accountName: string;
  onLogin: () => void;
  pending?: boolean;
}

/**
 * 获客任务绑定账号失效/被移除时的登录引导：
 * 点名任务实际使用的账号，避免与组织内其他有效账号混淆，
 * 并提供"恢复并扫码登录"直达动作（恢复软删除行后弹出扫码登录框）。
 */
export function BoundAccountLoginNotice({
  platformLabel,
  accountName,
  onLogin,
  pending = false
}: BoundAccountLoginNoticeProps) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p>
        任务绑定的账号「{platformLabel}-{accountName}」需要重新登录后才能增量执行。
        重新扫码后会自动恢复该账号并沿用原有任务数据。
      </p>
      <Button
        size="xs"
        variant="outline"
        className="mt-2"
        onClick={onLogin}
        disabled={pending}
      >
        {pending ? '恢复中…' : `恢复并扫码登录「${accountName}」`}
      </Button>
    </div>
  );
}
