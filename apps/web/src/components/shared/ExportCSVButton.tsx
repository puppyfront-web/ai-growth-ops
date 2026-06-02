'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authToken } from '@/lib/api/client';

interface ExportCSVButtonProps {
  url: string;
  filename?: string;
  label?: string;
  className?: string;
}

export function ExportCSVButton({ url, filename, label = '导出 CSV', className }: ExportCSVButtonProps) {
  const handleExport = async () => {
    try {
      const token = authToken.get();
      const response = await fetch(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(`导出失败: ${response.status}`);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition');
      const name = filename || disposition?.match(/filename="?([^"]+)"?/)?.[1] || 'export.csv';

      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} className={className}>
      <Download className="mr-1.5 h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
