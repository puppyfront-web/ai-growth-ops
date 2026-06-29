'use client';

import { LlmConfigCard } from '@/components/cockpit/LlmConfigCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

/**
 * Standalone LLM config page. The same card lives in the (now hidden) cockpit,
 * but LLM setup is a prerequisite for the whole CRM pipeline (AI 评论分级 →
 * 自动转化线索), so it must be reachable without the cockpit. Placed under
 * 集成配置 alongside the other external-service integrations (平台账号 / 飞书 / 企微).
 */
export default function LlmConfigPage() {
  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="LLM 配置"
        description="配置 AI 模型 · 驱动评论分级、回复生成、敏感内容审核"
      />
      <div className="max-w-2xl">
        <LlmConfigCard />
        <div className="mt-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-4 text-sm text-blue-800 dark:text-blue-200">
          <p className="font-medium mb-1">为什么需要配置 LLM？</p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li><b>评论自动分级</b>：AI 判断评论意向等级（A/B/C/D），A/B 级自动转为线索</li>
            <li><b>回复建议</b>：根据品牌口吻自动生成回复文案</li>
            <li><b>敏感审核</b>：识别谐音引流、变相联系方式等正则抓不住的内容</li>
            <li>API Key 加密存储在数据库，不写入 .env 文件</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
