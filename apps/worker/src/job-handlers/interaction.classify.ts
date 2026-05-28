import { Job } from 'bullmq';
import type { InteractionClassifyInput } from '../job-types.js';
import { createDatabaseClient } from '@ai-growth-ops/database';
import type { DatabaseClient } from '@ai-growth-ops/database';
import { DefaultSkillRunner } from '@ai-growth-ops/skills';

let _skillRunner: DefaultSkillRunner | null = null;
function getSkillRunner(): DefaultSkillRunner {
  if (!_skillRunner) _skillRunner = new DefaultSkillRunner();
  return _skillRunner;
}

export async function handleInteractionClassify(job: Job<InteractionClassifyInput>): Promise<void> {
  const { interactionId, platform, content, sourceContentTitle } = job.data;
  const db: DatabaseClient = createDatabaseClient();

  try {
    const interaction = await db.interaction.findFirst({ where: { id: interactionId } });
    if (!interaction) {
      job.log(`Interaction ${interactionId} not found, skipping`);
      return;
    }

    // Update status to CLASSIFYING
    await db.interaction.update({
      where: { id: interactionId },
      data: { status: 'CLASSIFYING' },
    });

    // Try AI classification via skill runner
    let classification: Record<string, unknown> | null = null;
    try {
      const runner = getSkillRunner();
      const result = await runner.run({
        skillName: 'lead-classification',
        input: {
          platform,
          interactionType: interaction.type,
          content,
          sourceContentTitle,
        },
      });
      if (result.status === 'success' && result.output) {
        classification = result.output as Record<string, unknown>;
      }
    } catch {
      // AI classification failed, use rule-based fallback
    }

    // Rule-based fallback
    if (!classification) {
      classification = classifyByRules(content);
    }

    // Write classification to database
    await db.interactionClassification.upsert({
      where: { interactionId },
      create: {
        interactionId,
        intent: String(classification.intent || 'unknown'),
        leadLevel: String(classification.leadLevel || 'D'),
        confidence: Number(classification.confidence || 0.5),
        riskLevel: String(classification.riskLevel || 'low'),
        summary: String(classification.summary || ''),
        tags: classification.tags as any || [],
        nextAction: String(classification.nextAction || ''),
      },
      update: {
        intent: String(classification.intent || 'unknown'),
        leadLevel: String(classification.leadLevel || 'D'),
        confidence: Number(classification.confidence || 0.5),
        riskLevel: String(classification.riskLevel || 'low'),
        summary: String(classification.summary || ''),
        tags: classification.tags as any || [],
        nextAction: String(classification.nextAction || ''),
      },
    });

    // Update interaction status
    await db.interaction.update({
      where: { id: interactionId },
      data: { status: 'CLASSIFIED' },
    });

    job.log(`Classified interaction ${interactionId}: intent=${classification.intent}, leadLevel=${classification.leadLevel}`);
  } finally {
    await db.$disconnect();
  }
}

function classifyByRules(content: string): Record<string, unknown> {
  const text = content.toLowerCase();

  // Price inquiry patterns
  if (text.match(/多少钱|价格|费用|报价|收费标准|cost|price/)) {
    return {
      intent: 'price_inquiry',
      leadLevel: 'A',
      confidence: 0.88,
      riskLevel: 'low',
      summary: '用户咨询价格',
      tags: ['价格咨询', '高意向'],
      nextAction: 'suggest_reply',
    };
  }

  // Appointment request
  if (text.match(/预约|预约吗|可以约|appointment|book/)) {
    return {
      intent: 'appointment_request',
      leadLevel: 'A',
      confidence: 0.90,
      riskLevel: 'low',
      summary: '用户希望预约',
      tags: ['预约', '高意向'],
      nextAction: 'notify_sales',
    };
  }

  // Cooperation inquiry
  if (text.match(/合作|代理|加盟|商务|cooperation|partner/)) {
    return {
      intent: 'cooperation_inquiry',
      leadLevel: 'A',
      confidence: 0.85,
      riskLevel: 'medium',
      summary: '用户咨询合作事宜',
      tags: ['合作', '商务'],
      nextAction: 'notify_sales',
    };
  }

  // Product inquiry
  if (text.match(/产品|方案|功能|服务|product|solution/)) {
    return {
      intent: 'product_inquiry',
      leadLevel: 'B',
      confidence: 0.80,
      riskLevel: 'low',
      summary: '用户咨询产品/方案',
      tags: ['产品咨询'],
      nextAction: 'suggest_reply',
    };
  }

  // Complaint
  if (text.match(/投诉|差评|不满|失望|垃圾|complaint|terrible/)) {
    return {
      intent: 'complaint',
      leadLevel: 'C',
      confidence: 0.85,
      riskLevel: 'high',
      summary: '用户投诉或不满',
      tags: ['投诉', '需关注'],
      nextAction: 'require_human_review',
    };
  }

  // Spam
  if (text.match(/加微|加v|微信号|vx/)) {
    return {
      intent: 'spam',
      leadLevel: 'D',
      confidence: 0.90,
      riskLevel: 'medium',
      summary: '疑似推广/垃圾信息',
      tags: ['推广', '垃圾'],
      nextAction: 'ignore',
    };
  }

  // General
  return {
    intent: 'general_chat',
    leadLevel: 'C',
    confidence: 0.50,
    riskLevel: 'low',
    summary: '一般互动',
    tags: [],
    nextAction: 'suggest_reply',
  };
}
