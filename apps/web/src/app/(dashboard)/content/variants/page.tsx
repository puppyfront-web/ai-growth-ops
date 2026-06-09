'use client';

import { useQuery } from '@tanstack/react-query';
import { listContentItems, getContentVariants } from '@/lib/api/content';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { StatusBadge, PlatformBadge } from '@/components/shared/StatusBadge';
import { useState } from 'react';

export default function VariantsPage() {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const { data: contentData } = useQuery({
    queryKey: ['content-items'],
    queryFn: () => listContentItems()
  });
  const { data: variantsData } = useQuery({
    queryKey: ['content-variants', selectedItem],
    queryFn: () => getContentVariants(selectedItem!),
    enabled: !!selectedItem
  });
  const items = contentData?.items ?? [];
  const variants = variantsData?.items ?? [];

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="平台版本"
        description="查看和管理各平台的内容适配版本"
      />
      <div className="mb-4">
        <select
          value={selectedItem ?? ''}
          onChange={(e) => setSelectedItem(e.target.value)}
          className="rounded-md border p-2 text-sm"
        >
          <option value="">选择内容</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </div>
      {selectedItem && variants && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {variants.map((v) => (
            <div key={v.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <PlatformBadge platform={v.platform} />
                <StatusBadge status={v.complianceStatus} />
              </div>
              <h4 className="font-medium text-sm">{v.title}</h4>
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {v.body}
              </p>
              {v.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {v.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-muted px-2 py-0.5 text-xs"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
