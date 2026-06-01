'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAnalyticsOverview } from '@/lib/api/analytics';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatNumber } from '@/lib/utils';
import { FileText, Calendar, TrendingUp, Users, Send } from 'lucide-react';

const reportTypes = [
  { key: 'daily', label: '日报', icon: Calendar, desc: '每日运营数据汇总' },
  { key: 'weekly', label: '周报', icon: TrendingUp, desc: '每周趋势分析与复盘' },
  { key: 'monthly', label: '月报', icon: FileText, desc: '月度综合运营报告' },
  { key: 'content', label: '内容复盘报告', icon: FileText, desc: '内容表现与 ROI 分析' },
  { key: 'lead', label: '线索复盘报告', icon: Users, desc: '线索转化漏斗分析' },
  { key: 'platform', label: '平台复盘报告', icon: Send, desc: '各平台表现对比分析' },
];

type GeneratedReport = { type: string; label: string; date: string; summary: string };

export default function ReportsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [reports, setReports] = useState<GeneratedReport[]>([]);

  const { data: overview } = useQuery({ queryKey: queryKeys.analytics.overview, queryFn: getAnalyticsOverview });

  const handleGenerate = (key: string) => {
    setSelectedType(key);
    setDialogOpen(true);
  };

  const confirmGenerate = () => {
    if (!selectedType) return;
    const rt = reportTypes.find((r) => r.key === selectedType)!;
    const summary = overview
      ? `发布 ${formatNumber(overview.totalPublished)} 篇，互动 ${formatNumber(overview.totalInteractions)} 次，合格线索 ${formatNumber(overview.totalLeads)} 条，内容 ${formatNumber(overview.totalContentItems)} 项。`
      : '暂无数据';
    setReports((prev) => [{ type: selectedType, label: rt.label, date: new Date().toLocaleDateString('zh-CN'), summary }, ...prev]);
    setDialogOpen(false);
    setSelectedType(null);
  };

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
            {reports.map((report, i) => (
              <div key={i} className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{report.label}</span>
                  <span className="text-xs text-muted-foreground">{report.date}</span>
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
          <DialogFooter><Button size="sm" onClick={confirmGenerate}>确认生成</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
