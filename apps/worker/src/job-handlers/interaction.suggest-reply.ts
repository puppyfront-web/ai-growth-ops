import { Job } from 'bullmq';
import type { InteractionSuggestReplyInput } from '../job-types.js';
import { createDatabaseClient } from '@ai-growth-ops/database';
import type { DatabaseClient } from '@ai-growth-ops/database';
import { DefaultSkillRunner } from '@ai-growth-ops/skills';

let _skillRunner: DefaultSkillRunner | null = null;
function getSkillRunner(): DefaultSkillRunner {
  if (!_skillRunner) _skillRunner = new DefaultSkillRunner();
  return _skillRunner;
}

export async function handleInteractionSuggestReply(job: Job<InteractionSuggestReplyInput>): Promise<void> {
  const { interactionId, classification, platform, brandTone } = job.data;
  const db: DatabaseClient = createDatabaseClient();

  try {
    const interaction = await db.interaction.findFirst({
      where: { id: interactionId },
      include: { classification: true },
    });
    if (!interaction) {
      job.log(`Interaction ${interactionId} not found, skipping`);
      return;
    }

    const classData = classification || (interaction.classification as Record<string, unknown>) || {};
    const riskLevel = String(classData.riskLevel || 'low');
    const leadLevel = String(classData.leadLevel || 'C');

    // Try AI reply suggestion
    let suggestion: { text: string; replyType: string; needReview: boolean } | null = null;
    try {
      const runner = getSkillRunner();
      const result = await runner.run({
        skillName: 'reply-suggestion',
        input: {
          interaction: {
            content: interaction.content,
            platform,
            type: interaction.type,
          },
          classification: classData,
          brandTone: brandTone || '专业、克制、不过度承诺',
        },
      });
      if (result.status === 'success' && result.output) {
        const output = result.output as Record<string, unknown>;
        suggestion = {
          text: String(output.suggestedText || ''),
          replyType: String(output.replyType || 'faq_answer'),
          needReview: Boolean(output.needReview),
        };
      }
    } catch {
      // AI failed, use rule-based fallback
    }

    // Rule-based fallback
    if (!suggestion) {
      suggestion = generateRuleBasedReply(interaction.content, classData, platform);
    }

    // Determine if review is needed based on policy
    const needReview =
      suggestion.needReview ||
      riskLevel === 'high' ||
      leadLevel === 'A' ||
      containsSensitiveContent(suggestion.text);

    // Create ReplySuggestion record
    await db.replySuggestion.create({
      data: {
        interactionId,
        suggestedText: suggestion.text,
        replyType: suggestion.replyType as any,
        riskLevel,
        needReview,
        decision: needReview ? 'require_human_review' : 'auto_send_allowed',
        decisionReason: needReview
          ? 'Requires human review due to policy rules'
          : 'Low risk, auto-send allowed',
        status: needReview ? 'waiting_review' : 'draft',
      },
    });

    // Update interaction status
    await db.interaction.update({
      where: { id: interactionId },
      data: { status: 'REPLY_SUGGESTED' },
    });

    job.log(`Suggested reply for ${interactionId}: needReview=${needReview}`);
  } finally {
    await db.$disconnect();
  }
}

function generateRuleBasedReply(
  content: string,
  classification: Record<string, unknown>,
  platform: string,
): { text: string; replyType: string; needReview: boolean } {
  const intent = String(classification.intent || 'unknown');
  const text = content.toLowerCase();

  if (intent === 'price_inquiry' || text.match(/多少钱|价格/)) {
    return {
      text: '您好，具体价格会根据您的需求有所不同。可以私信我了解详细方案和报价，我这边安排同事为您详细介绍。',
      replyType: 'guide_to_private',
      needReview: false,
    };
  }

  if (intent === 'appointment_request' || text.match(/预约/)) {
    return {
      text: '您好，感谢您的关注！可以私信我您的联系方式，我这边安排专业顾问为您预约演示。',
      replyType: 'guide_to_wecom',
      needReview: false,
    };
  }

  if (intent === 'product_inquiry' || text.match(/产品|方案|功能/)) {
    return {
      text: '您好，我们提供完整的解决方案。可以私信我了解详细方案和案例参考。',
      replyType: 'ask_more_info',
      needReview: false,
    };
  }

  if (intent === 'complaint' || text.match(/投诉|差评|不满/)) {
    return {
      text: '非常抱歉给您带来不好的体验。我们会尽快核实并处理您的问题，请私信我们详细情况。',
      replyType: 'complaint_response',
      needReview: true,
    };
  }

  return {
    text: '感谢您的关注！如有任何问题欢迎随时私信我们。',
    replyType: 'thanks',
    needReview: false,
  };
}

function containsSensitiveContent(text: string): boolean {
  const sensitivePatterns = [
    /1[3-9]\d{9}/, // Phone numbers
    /微信[号:]?\s*\w{5,}/, // WeChat IDs
    /[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+\.[a-zA-Z]+/, // Email addresses
    /加[我微vVxXqQ]/, // "add my WeChat"
    /http[s]?:\/\//, // URLs
  ];
  return sensitivePatterns.some(p => p.test(text));
}
