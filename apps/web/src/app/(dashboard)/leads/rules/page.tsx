'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getComplianceRules, updateComplianceRules } from '@/lib/api/settings';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { LeadLevelBadge } from '@/components/shared/StatusBadge';
import { Shield, Zap, Brain, AlertTriangle } from 'lucide-react';

const levelCards = [
  {
    level: 'A' as const,
    desc: '高意向用户，明确表达购买/合作意愿',
    action: '优先跟进，尽快联系'
  },
  {
    level: 'B' as const,
    desc: '中等意向，对产品/服务有兴趣',
    action: '持续触达，培育转化'
  },
  {
    level: 'C' as const,
    desc: '低意向，初步了解阶段',
    action: '定期触达，保持关注'
  },
  {
    level: 'D' as const,
    desc: '无意向，不相关或无效互动',
    action: '可忽略，不分配资源'
  }
];

export default function LeadRulesPage() {
  const qc = useQueryClient();
  const {
    data: rules,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['compliance-rules'],
    queryFn: getComplianceRules
  });

  const [highRiskReview, setHighRiskReview] = useState(true);
  const [lowConfidenceReview, setLowConfidenceReview] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateComplianceRules({
        ...rules,
        humanConfirmRules: [
          {
            action: 'high_risk_auto_review',
            threshold: highRiskReview ? 1 : 0
          },
          {
            action: 'low_confidence_auto_review',
            threshold: lowConfidenceReview ? 1 : 0
          }
        ]
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance-rules'] })
  });

  if (isLoading) return <LoadingState rows={4} />;
  if (error)
    return <ErrorState message="加载规则配置失败" onRetry={() => refetch()} />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="线索评级规则"
        description="配置线索自动评级与风险控制规则"
      />

      <div className="max-w-4xl space-y-6">
        {/* Pipeline description */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base font-semibold">
                自动分类流水线
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                新互动
              </span>
              <span>→</span>
              <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                AI 分类
              </span>
              <span>→</span>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                风险检查
              </span>
              <span>→</span>
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                转线索
              </span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              系统使用 AI 技能{' '}
              <code className="rounded bg-muted px-1">lead-classification</code>{' '}
              自动分析互动内容，
              识别用户意图和意向等级，结合风险规则决定是否自动转化或转人工审核。
            </p>
          </CardContent>
        </Card>

        {/* Risk control */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-500" />
              <CardTitle className="text-base font-semibold">
                风险控制
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <div>
                  <div className="text-sm font-medium">
                    高风险内容自动转人工
                  </div>
                  <div className="text-xs text-muted-foreground">
                    检测到高风险内容时，不自动回复，转人工审核
                  </div>
                </div>
              </div>
              <Switch
                checked={highRiskReview}
                onCheckedChange={setHighRiskReview}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-500" />
                <div>
                  <div className="text-sm font-medium">低置信度转人工审核</div>
                  <div className="text-xs text-muted-foreground">
                    AI 分类置信度低于阈值时，转人工确认
                  </div>
                </div>
              </div>
              <Switch
                checked={lowConfidenceReview}
                onCheckedChange={setLowConfidenceReview}
              />
            </div>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {saveMutation.isPending ? '保存中...' : '保存规则'}
            </button>
          </CardContent>
        </Card>

        {/* Level definitions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-base font-semibold">
                线索分级定义
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {levelCards.map((lc) => (
                <div key={lc.level} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <LeadLevelBadge level={lc.level} />
                  </div>
                  <p className="text-xs text-muted-foreground">{lc.desc}</p>
                  <p className="mt-1 text-xs font-medium">
                    建议操作: {lc.action}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
