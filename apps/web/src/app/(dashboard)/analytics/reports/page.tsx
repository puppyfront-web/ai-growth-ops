'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getReports, generateReport } from '@/lib/api/settings';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FileText, Calendar, TrendingUp, Users, Send } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils';

const reportTypes = [
  { key: 'daily', label: '日报', icon: Calendar, desc: '每日运营数据汇总' },
  { key: 'weekly', label: '周报', icon: TrendingUp, desc: '每周趋势分析与复盘' },
  { key: 'monthly', label: '月报', icon: FileText, desc: '月度综合运营报告' },
  { key: 'content', label: '内容复盘报告', icon: FileText, desc: '内容表现与 ROI 分析' },
  { key: 'lead', label: '线索复盘报告', icon: Users, desc: '线索转化漏斗分析' },
  { key: 'platform', label: '平台复盘报告', icon: Send, desc: '各平台表现对比分析' },
];

export default function ReportsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const { data: reports = [], isLoading, error, refetch } = useQuery({
    queryKey: ['reports'],
    queryFn: getReports,
  });

  const generateMutation = useMutation({
    mutationFn: (type: string) => generateReport(type),
    onSuccess: () => {
      toast.success('报告已生成');
      qc.invalidateQueries({ queryKey: ['reports'] });
      setDialogOpen(false);
      setSelectedType(null);
    },
    onError: (err: Error) => toast.error(`生成失败: ${err.message}`),
  });

  const handleGenerate = (key: string) => {
    setSelectedType(key);
    setDialogOpen(true);
  };

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message="加载报告失败" onRetry={() => refetch()} />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="运营报告" description="生成和管理运营报告" />

      {/* Report type cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        {reportTypes.map((rt) => (
          <Card key={rt.key}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <rt.icon className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">{rt.label}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">{rt.desc}</p>
              <Button variant="outline" size="sm" onClick={() => handleGenerate(rt.key)}>生成{rt.label}</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Generated reports */}
      {reports.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">已生成报告</h3>
          <div className="space-y-3">
            {reports.map((report) => (
              <div key={report.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{report.label}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(report.createdAt)}</span>
                </div>
                <p className="text-sm text-muted-foreground">{report.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>确认生成报告？</DialogTitle></DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">
            系统将汇总当前数据生成 {reportTypes.find((r) => r.key === selectedType)?.label ?? '报告'}。
          </p>
          <DialogFooter>
            <Button size="sm" onClick={() => selectedType && generateMutation.mutate(selectedType)} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? '生成中...' : '确认生成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
