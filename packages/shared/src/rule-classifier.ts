/**
 * Rule-based classification and reply suggestion fallbacks.
 * Shared between API routes, worker pipeline, and runtime-core tools.
 *
 * Used when the LLM skill runner is unavailable
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

  // B2B / bulk purchase inquiry (highest value)
  if (
    text.match(/批量|采购|批发|供货|经销商|代理|加盟|商务合作|合作|公司想|企业/)
  ) {
    return {
      intent: 'cooperation_inquiry',
      leadLevel: 'A',
      confidence: 0.88,
      riskLevel: 'medium',
      summary: '用户咨询合作/批发事宜',
      tags: ['合作', '商务', '高意向'],
      nextAction: 'notify_sales'
    };
  }

  // Price inquiry
  if (
    text.match(
      /多少钱|价格|费用|报价|收费标准|怎么卖|在哪买|哪里买|购买|cost|price/
    )
  ) {
    return {
      intent: 'price_inquiry',
      leadLevel: 'A',
      confidence: 0.88,
      riskLevel: 'low',
      summary: '用户咨询价格/购买渠道',
      tags: ['价格咨询', '高意向'],
      nextAction: 'suggest_reply'
    };
  }

  // Appointment / demo request
  if (text.match(/预约|可以约|演示|体验|appointment|book|demo/)) {
    return {
      intent: 'appointment_request',
      leadLevel: 'A',
      confidence: 0.9,
      riskLevel: 'low',
      summary: '用户希望预约/体验',
      tags: ['预约', '高意向'],
      nextAction: 'notify_sales'
    };
  }

  // Complaint / negative (check BEFORE general product inquiry to catch "垃圾产品")
  if (
    text.match(
      /投诉|差评|不满|失望|垃圾|骗|退款|假货|难用|坑|别买|退货.*不|complaint|terrible/
    )
  ) {
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

  // Product quality / detail inquiry
  if (
    text.match(
      /质量|怎么样|能用|耐用|售后|保修|换货|退货|材质|规格|参数|介绍|详细/
    )
  ) {
    return {
      intent: 'product_inquiry',
      leadLevel: 'B',
      confidence: 0.82,
      riskLevel: 'low',
      summary: '用户咨询产品详情/质量',
      tags: ['产品咨询', '中意向'],
      nextAction: 'suggest_reply'
    };
  }

  // General product mention
  if (text.match(/产品|方案|功能|服务|product|solution/)) {
    return {
      intent: 'product_inquiry',
      leadLevel: 'B',
      confidence: 0.75,
      riskLevel: 'low',
      summary: '用户咨询产品/方案',
      tags: ['产品咨询'],
      nextAction: 'suggest_reply'
    };
  }

  // Positive engagement (follows, likes, support)
  if (text.match(/关注|不错|喜欢|支持|加油|好看|棒|赞|收藏/)) {
    return {
      intent: 'positive_engagement',
      leadLevel: 'C',
      confidence: 0.8,
      riskLevel: 'low',
      summary: '正面互动（关注/点赞）',
      tags: ['正面互动'],
      nextAction: 'suggest_reply'
    };
  }

  // Spam / ads
  if (text.match(/加微|加v|微信号|vx|代刷|兼职|赚钱/)) {
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

  // General / unclear
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

  // Complaint/negative — check FIRST before product inquiry (catches "垃圾产品")
  if (
    intent === 'complaint' ||
    text.match(/投诉|差评|不满|失望|垃圾|骗|退款|假货|难用|坑|别买/)
  ) {
    return {
      suggestedText:
        '非常抱歉给您带来不好的体验，我们非常重视您的反馈。请私信我们详细情况，我们会尽快核实并为您妥善处理。',
      replyType: 'complaint_response',
      riskLevel: 'high',
      needReview: true,
      reason: 'Complaint response requires human review'
    };
  }

  if (
    intent === 'cooperation_inquiry' ||
    text.match(/合作|代理|加盟|批发|批量|采购/)
  ) {
    return {
      suggestedText:
        '您好，感谢您对我们产品的关注！关于合作事宜，可以私信我详细沟通，我会安排商务同事尽快与您对接，为您提供最合适的合作方案。',
      replyType: 'guide_to_private',
      riskLevel: 'medium',
      needReview: true,
      reason: 'Cooperation inquiry should be reviewed before sending'
    };
  }

  if (
    intent === 'price_inquiry' ||
    text.match(/多少钱|价格|怎么卖|在哪买|哪里买|购买/)
  ) {
    return {
      suggestedText:
        '您好，具体价格会根据您选择的规格和数量有所不同。可以私信我了解详细方案和报价，这边安排同事为您详细介绍哦～',
      replyType: 'guide_to_private',
      riskLevel: 'low',
      needReview: false
    };
  }

  if (intent === 'appointment_request' || text.match(/预约|演示|体验/)) {
    return {
      suggestedText:
        '您好，感谢您的关注！可以私信我您的联系方式，这边安排专业顾问为您预约演示体验。',
      replyType: 'guide_to_wecom',
      riskLevel: 'low',
      needReview: false
    };
  }

  if (
    intent === 'product_inquiry' ||
    text.match(/质量|怎么样|能用|售后|介绍|详细|产品|功能/)
  ) {
    return {
      suggestedText:
        '您好，我们的产品品质有保障，提供完善的售后服务。可以私信我了解详细的产品参数和使用案例，这边为您详细介绍！',
      replyType: 'ask_more_info',
      riskLevel: 'low',
      needReview: false
    };
  }

  if (intent === 'positive_engagement' || text.match(/关注|不错|喜欢|支持/)) {
    return {
      suggestedText:
        '感谢关注和支持！我们会持续分享优质内容，有需要随时私信我们哦～',
      replyType: 'thanks',
      riskLevel: 'low',
      needReview: false
    };
  }

  return {
    suggestedText:
      '感谢您的关注！如有任何问题欢迎随时私信我们，我们会尽快为您解答。',
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
