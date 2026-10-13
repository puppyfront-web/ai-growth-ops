'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FeishuSyncForm } from '@/components/integrations/FeishuSyncForm';
import { WecomSyncForm } from '@/components/integrations/WecomSyncForm';
import { WebhookPushCard } from '@/components/integrations/WebhookPushCard';

export default function SyncPage() {
  const [tab, setTab] = useState('feishu');

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="同步与推送"
        description="客户同步到飞书多维表格 / 企业微信，业务事件通过 Webhook 推送到你的系统"
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="feishu">飞书多维表格</TabsTrigger>
          <TabsTrigger value="wecom">企业微信</TabsTrigger>
          <TabsTrigger value="webhook">Webhook 推送</TabsTrigger>
        </TabsList>
        <TabsContent value="feishu" className="mt-6">
          <FeishuSyncForm />
        </TabsContent>
        <TabsContent value="wecom" className="mt-6">
          <WecomSyncForm />
        </TabsContent>
        <TabsContent value="webhook" className="mt-6">
          <WebhookPushCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
