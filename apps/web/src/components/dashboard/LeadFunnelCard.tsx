'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { leadLevelLabels } from '@/lib/constants';
import { cn } from '@/lib/utils';

export type LeadFunnelCardProps = {
  qualifiedLeads: number;
  totalLeads: number;
  className?: string;
};

const funnelLevels = [
  { key: 'A', label: leadLevelLabels.A, color: 'bg-emerald-500' },
  { key: 'B', label: leadLevelLabels.B, color: 'bg-blue-500' },
  { key: 'C', label: leadLevelLabels.C, color: 'bg-amber-500' },
  { key: 'D', label: leadLevelLabels.D, color: 'bg-gray-400' },
];

export function LeadFunnelCard({ qualifiedLeads, totalLeads, className }: LeadFunnelCardProps) {
  const qualifiedPct = totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-500" />
          <CardTitle className="text-base font-semibold">线索漏斗</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <span className="text-2xl font-bold">{qualifiedLeads}</span>
            <span className="text-sm text-muted-foreground"> / {totalLeads} 合格</span>
          </div>
          <span className="text-sm font-medium text-emerald-600">{qualifiedPct}%</span>
        </div>
        <div className="space-y-2">
          {funnelLevels.map((level) => {
            const width = totalLeads > 0 ? Math.max(8, (qualifiedLeads / totalLeads) * 100) : 8;
            return (
              <div key={level.key} className="flex items-center gap-2">
                <span className="w-16 text-xs text-muted-foreground">{level.label}</span>
                <div className="flex-1">
                  <div className="h-4 rounded-full bg-muted">
                    <div className={cn('h-full rounded-full', level.color)} style={{ width: `${width}%`, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
