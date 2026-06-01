'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getStorageConfig, updateStorageConfig } from '@/lib/api/settings';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';

export default function StoragePage() {
  const qc = useQueryClient();
  const [storageType, setStorageType] = useState('local');
  const [path, setPath] = useState('./uploads');
  const [maxSize, setMaxSize] = useState('50');
  const [endpoint, setEndpoint] = useState('');
  const [bucket, setBucket] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStorageConfig()
      .then((config) => {
        setStorageType(config.storageType ?? 'local');
        setPath(config.path ?? './uploads');
        setMaxSize(String(config.maxSize ?? 50));
        setEndpoint(config.endpoint ?? '');
        setBucket(config.bucket ?? '');
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const saveMutation = useMutation({
    mutationFn: () => updateStorageConfig({ storageType, path, maxSize: Number(maxSize), endpoint, bucket }),
    onSuccess: () => {
      toast.success('存储配置已保存');
      qc.invalidateQueries({ queryKey: ['storage-config'] });
    },
    onError: () => toast.error('保存失败，请重试'),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

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
                <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder={storageType === 's3' ? 's3.amazonaws.com' : 'localhost:9000'} className="mt-1 w-full rounded-md border p-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Bucket</label>
                <input value={bucket} onChange={(e) => setBucket(e.target.value)} placeholder="my-bucket" className="mt-1 w-full rounded-md border p-2 text-sm" />
              </div>
            </>
          )}
          <div className="flex items-center gap-3">
            <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground disabled:opacity-50">
              {saveMutation.isPending ? '保存中...' : '保存'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
