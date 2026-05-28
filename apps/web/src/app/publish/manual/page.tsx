'use client';

import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { useState } from 'react';

const checklistItems = [
  { key: 'copyTitle', label: '复制标题' },
  { key: 'copyBody', label: '复制正文' },
  { key: 'downloadMedia', label: '下载/打开素材' },
  { key: 'openPlatform', label: '打开平台后台' },
  { key: 'uploadMedia', label: '上传素材' },
  { key: 'pasteContent', label: '粘贴文案' },
  { key: 'confirmPublish', label: '确认发布' },
  { key: 'fillUrl', label: '填写发布 URL' },
  { key: 'markComplete', label: '标记完成' },
];

export default function ManualPublishPage() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="人工发布待办" description="平台 API 不可用或需要人工确认的发布任务" />

      <div className="rounded-xl border bg-card p-6 max-w-2xl">
        <h3 className="font-semibold mb-4">发布检查清单</h3>
        <div className="space-y-3">
          {checklistItems.map((item) => (
            <label key={item.key} className="flex items-center gap-3">
              <input type="checkbox" checked={checked[item.key] ?? false} onChange={(e) => setChecked((prev) => ({ ...prev, [item.key]: e.target.checked }))} className="rounded" />
              <span className={`text-sm ${checked[item.key] ? 'line-through text-muted-foreground' : ''}`}>{item.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-6">
          <button disabled={!Object.keys(checked).every((k) => checked[k])} className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground disabled:opacity-50">标记发布完成</button>
        </div>
      </div>
    </div>
  );
}
