'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card, CardContent } from '@/components/ui/card';

export default function StoragePage() {
  const [storageType, setStorageType] = useState('local');
  const [path, setPath] = useState('./uploads');
  const [maxSize, setMaxSize] = useState('50');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="存储配置" description="配置素材存储方式" />

      <Card className="max-w-lg">
        <CardContent className="space-y-4 pt-6">
          <div>
            <label className="text-sm font-medium">存储方式</label>
            <select value={storageType} onChange={(e) => setStorageType(e.target.value)} className="mt-1 w-full rounded-md border p-2 text-sm">
              <option value="local">本地存储</option>
              <option value="minio">MinIO</option>
              <option value="s3">AWS S3</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">存储路径</label>
            <input value={path} onChange={(e) => setPath(e.target.value)} className="mt-1 w-full rounded-md border p-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">最大文件大小 (MB)</label>
            <input type="number" value={maxSize} onChange={(e) => setMaxSize(e.target.value)} className="mt-1 w-full rounded-md border p-2 text-sm" />
          </div>
          {storageType !== 'local' && (
            <>
              <div>
                <label className="text-sm font-medium">Endpoint</label>
                <input placeholder={storageType === 's3' ? 's3.amazonaws.com' : 'localhost:9000'} className="mt-1 w-full rounded-md border p-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Bucket</label>
                <input placeholder="my-bucket" className="mt-1 w-full rounded-md border p-2 text-sm" />
              </div>
            </>
          )}
          <div className="flex items-center gap-3">
            <button onClick={handleSave} className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground">保存</button>
            {saved && <span className="text-sm text-emerald-600">已保存</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
