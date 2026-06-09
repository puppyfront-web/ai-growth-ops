/**
 * Rule-based classification and reply suggestion fallbacks.
 * Ported from apps/worker/src/job-handlers/interaction.classify.ts
 * and apps/worker/src/job-handlers/interaction.suggest-reply.ts.
 *
 * These functions are used when the LLM skill runner is unavailable
 * (no API key, network error, invalid response).
 */

// ── Types ──────────────────────────────────────────────────────────

export interface ClassificationResult {
  intent: string;
  leadLevel: 'A' | 'B' | 'C' | 'D';
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
  tags: string[];
  nextAction: string;
}

export interface ReplySuggestionResult {
  suggestedText: string;
  replyType: string;
  riskLevel: 'low' | 'medium' | 'high';
  needReview: boolean;
  reason?: string;
}

// ── Classification ─────────────────────────────────────────────────

export function classifyByRules(content: string): ClassificationResult {
  const text = content.toLowerCase();

  // Price inquiry
  if (text.match(/多少钱|价格|费用|报价|收费标准|cost|price/)) {
    return {
      intent: 'price_inquiry',
      leadLevel: 'A',
      confidence: 0.88,
      riskLevel: 'low',
      summary: '用户咨询价格',
      tags: ['价格咨询', '高意向'],
      nextAction: 'suggest_reply'
    };
  }

  // Appointment request
  if (text.match(/预约|可以约|appointment|book/)) {
    return {
      intent: 'appointment_request',
      leadLevel: 'A',
      confidence: 0.9,
      riskLevel: 'low',
      summary: '用户希望预约',
      tags: ['预约', '高意向'],
      nextAction: 'notify_sales'
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
      nextAction: 'notify_sales'
    };
  }

  // Product inquiry
  if (text.match(/产品|方案|功能|服务|product|solution/)) {
    return {
      intent: 'product_inquiry',
      leadLevel: 'B',
      confidence: 0.8,
      riskLevel: 'low',
      summary: '用户咨询产品/方案',
      tags: ['产品咨询'],
      nextAction: 'suggest_reply'
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
      nextAction: 'require_human_review'
    };
  }

  // Spam
  if (text.match(/加微|加v|微信号|vx/)) {
    return {
      intent: 'spam',
      leadLevel: 'D',
      confidence: 0.9,
      riskLevel: 'medium',
      summary: '疑似推广/垃圾信息',
      tags: ['推广', '垃圾'],
      nextAction: 'ignore'
    };
  }

  // General
  return {
    intent: 'general_chat',
    leadLevel: 'C',
    confidence: 0.5,
    riskLevel: 'low',
    summary: '一般互动',
    tags: [],
    nextAction: 'suggest_reply'
  };
}

// ── Reply Suggestion ───────────────────────────────────────────────

export function generateRuleBasedReply(
  content: string,
  classification: ClassificationResult,
  _platform: string
): ReplySuggestionResult {
  const intent = classification.intent;
  const text = content.toLowerCase();

  if (intent === 'price_inquiry' || text.match(/多少钱|价格/)) {
    return {
      suggestedText:
        '您好，具体价格会根据您的需求有所不同。可以私信我了解详细方案和报价，我这边安排同事为您详细介绍。',
      replyType: 'guide_to_private',
      riskLevel: 'low',
      needReview: false
    };
  }

  if (intent === 'appointment_request' || text.match(/预约/)) {
    return {
      suggestedText:
        '您好，感谢您的关注！可以私信我您的联系方式，我这边安排专业顾问为您预约演示。',
      replyType: 'guide_to_wecom',
      riskLevel: 'low',
      needReview: false
    };
  }

  if (intent === 'cooperation_inquiry' || text.match(/合作|代理|加盟/)) {
    return {
      suggestedText:
        '您好，感谢您对我们产品的关注！关于合作事宜，可以私信我详细沟通，我会安排商务同事与您对接。',
      replyType: 'guide_to_private',
      riskLevel: 'medium',
      needReview: true,
      reason: 'Cooperation inquiry should be reviewed before sending'
    };
  }

  if (intent === 'product_inquiry' || text.match(/产品|方案|功能/)) {
    return {
      suggestedText:
        '您好，我们提供完整的解决方案。可以私信我了解详细方案和案例参考。',
      replyType: 'ask_more_info',
      riskLevel: 'low',
      needReview: false
    };
  }

  if (intent === 'complaint' || text.match(/投诉|差评|不满/)) {
    return {
      suggestedText:
        '非常抱歉给您带来不好的体验。我们会尽快核实并处理您的问题，请私信我们详细情况。',
      replyType: 'complaint_response',
      riskLevel: 'high',
      needReview: true,
      reason: 'Complaint response requires human review'
    };
  }

  return {
    suggestedText: '感谢您的关注！如有任何问题欢迎随时私信我们。',
    replyType: 'thanks',
    riskLevel: 'low',
    needReview: false
  };
}

// ── Sensitive Content Detection ────────────────────────────────────

export function containsSensitiveContent(text: string): boolean {
  const sensitivePatterns = [
    /1[3-9]\d{9}/, // Phone numbers
    /微信[号:]?\s*\w{5,}/, // WeChat IDs
    /[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+\.[a-zA-Z]+/, // Email addresses
    /加[我微vVxXqQ]/, // "add my WeChat"
    /https?:\/\// // URLs
  ];
  return sensitivePatterns.some((p) => p.test(text));
}
