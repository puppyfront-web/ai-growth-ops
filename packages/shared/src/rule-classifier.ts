/**
 * Rule-based classification and reply suggestion fallbacks.
 * Shared between API routes and the worker pipeline.
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

/**
 * AI-enhanced sensitive content detection.
 *
 * The regex above only catches literal phone/WeChat/email/URL patterns and
 * misses semantic evasions common on Chinese social platforms: homophones
 * ("威信" for 微信), QQ numbers, emoji-encoded contact info, "私信我拿价"
 * style soft引流, etc. This function asks an LLM for a semantic judgement.
 *
 * Strategy (cost/latency aware):
 *   1. Run the cheap regex first — a hit is authoritative, no LLM call needed.
 *   2. Only on a regex miss, ask the LLM for a semantic check.
 *   3. Any LLM error (no key, network, bad JSON) degrades to { sensitive: false }
 *      so the reply pipeline never blocks on the audit step.
 *
 * Standalone: calls an OpenAI-compatible endpoint via fetch so this package
 * stays free of a workspace AI dependency.
 */
export async function classifySensitiveWithAI(
  text: string
): Promise<{ sensitive: boolean; reason?: string }> {
  // Fast path: existing regex catches literal patterns definitively.
  if (containsSensitiveContent(text)) {
    return { sensitive: true, reason: 'regex: literal contact pattern' };
  }

  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    '';
  if (!apiKey) return { sensitive: false };

  const baseUrl = (
    process.env.OPENAI_BASE_URL ||
    'https://api.openai.com/v1'
  ).replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        max_tokens: 80,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '你是合规审核助手。判断一段客服回复是否含有变相留联系方式、引流到站外、违规营销等敏感内容。只输出JSON: {"sensitive": true/false, "reason": "简短中文说明"}。注意识别谐音(威信/vx)、QQ号、emoji编码的联系方式、"私信我"等软引流。'
          },
          { role: 'user', content: text }
        ]
      }),
      signal: AbortSignal.timeout(15_000)
    });
    if (!resp.ok) return { sensitive: false };
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw) as {
      sensitive?: boolean;
      reason?: string;
    };
    return {
      sensitive: parsed.sensitive === true,
      reason: parsed.reason
    };
  } catch {
    return { sensitive: false };
  }
}
