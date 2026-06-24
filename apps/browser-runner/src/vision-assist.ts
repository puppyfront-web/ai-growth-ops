/**
 * Vision-assisted element location — the safety net for brittle CSS selectors.
 *
 * Douyin / Xiaohongshu render with hashed class names that change on every
 * deploy, so a selector that works today silently breaks tomorrow and the
 * automation stalls with no fallback. This module lets the caller say "find me
 * the 发布 button" (by natural-language intent); when normal selectors miss it
 * screenshots the page, asks a vision-capable LLM where the element is, and
 * returns a point we can click.
 *
 * Design notes:
 * - Zero hard dependency on a workspace AI package: browser-runner stays
 *   standalone and reads LLM config purely from env (OpenAI-compatible API).
 * - Every call is wrapped so a missing key or a model error degrades to
 *   "no result" instead of throwing — the caller then falls back to its own
 *   retry / human-handoff path.
 * - Coordinates are normalised to the LLM's image space; the helper maps them
 *   back to the page's actual viewport.
 */
import type { Page } from 'playwright';

/** A target the caller wants to locate on the page. */
export interface VisionTarget {
  /** Plain-language description, e.g. "发布按钮" / "回复输入框" / "关闭弹窗的叉号". */
  intent: string;
  /**
   * Optional frame hint. Screenshots and input always operate at the Page
   * level (Frame has no screenshot/mouse/keyboard API), so a frame is only
   * used to qualify the intent prompt — the returned coordinates are in page
   * space and clicked via page.mouse.
   */
  frame?: import('playwright').Frame;
}

/** Result of a vision lookup. */
export interface VisionLocation {
  /** Click point in page CSS coordinates (x from left, y from top). */
  x: number;
  y: number;
  /** What the model believed it found, useful for logging. */
  description?: string;
}

interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function readLLMConfig(): LLMConfig | null {
  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.VISION_API_KEY ||
    '';
  if (!apiKey) return null;
  const baseUrl = (
    process.env.OPENAI_BASE_URL ||
    process.env.VISION_BASE_URL ||
    'https://api.openai.com/v1'
  ).replace(/\/$/, '');
  const model =
    process.env.VISION_MODEL ||
    process.env.OPENAI_MODEL ||
    'gpt-4o';
  return { apiKey, baseUrl, model };
}

/** True when a vision-capable LLM is configured (env present). */
export function isVisionAssistAvailable(): boolean {
  return readLLMConfig() !== null;
}

interface ModelBoundingBox {
  x: number;
  y: number;
}

/**
 * Ask the vision model to locate `target` on the current page.
 * Returns null when vision is unavailable or the model can't find it — callers
 * MUST treat null as "fallback / give up", never as success.
 */
export async function locateWithVision(
  page: Page,
  target: VisionTarget
): Promise<VisionLocation | null> {
  const cfg = readLLMConfig();
  if (!cfg) return null;

  // Screenshots are taken at the Page level — Frame has no screenshot API and
  // a page-level capture is what the vision model needs to reason about layout.
  let screenshot: Buffer;
  try {
    screenshot = await page.screenshot({ type: 'png' });
  } catch {
    return null;
  }

  const dataUrl = `data:image/png;base64,${screenshot.toString('base64')}`;

  // Ask for a JSON point. We deliberately keep the prompt tight — this runs on
  // a hot path (selector miss) and cost/latency matter.
  const payload = {
    model: cfg.model,
    max_tokens: 120,
    temperature: 0,
    response_format: { type: 'json_object' as const },
    messages: [
      {
        role: 'system',
        content:
          '你是网页元素定位助手。用户给出中文意图,你从截图里找到对应可点击元素,返回其中心点坐标。只输出 JSON: {"found": true/false, "x": 数字, "y": 数字, "desc": "简短描述"}。坐标基于图片左上角原点。找不到就 found:false。'
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: `找到页面上的:${target.intent}` },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ]
  };

  let box: ModelBoundingBox | null = null;
  let description: string | undefined;
  try {
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000)
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      choices?: Array<{
        message?: { content?: string };
      }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw) as {
      found?: boolean;
      x?: number;
      y?: number;
      desc?: string;
    };
    if (!parsed.found || typeof parsed.x !== 'number' || typeof parsed.y !== 'number') {
      return null;
    }
    box = { x: parsed.x, y: parsed.y };
    description = parsed.desc;
  } catch {
    return null;
  }

  if (!box) return null;

  // The screenshot may differ in size from the page viewport; scale the
  // model coordinates back into page CSS pixels.
  let scale = 1;
  try {
    const vp = page.viewportSize();
    if (vp) {
      // Re-measure screenshot dims cheaply via the PNG IHDR (16-byte header).
      const w = screenshot.readUInt32BE(16) || vp.width;
      scale = vp.width ? w / vp.width : 1;
    }
  } catch {
    /* keep scale = 1 */
  }

  return {
    x: Math.round(box.x / scale),
    y: Math.round(box.y / scale),
    description
  };
}

/**
 * Convenience: try a Playwright locator first; on miss, fall back to vision.
 * Returns true if the element was clicked (by either path).
 *
 * Usage in a hot loop:
 *   if (!(await clickWithVisionFallback(page, primaryBtn, '发布按钮'))) {
 *     throw new Error('找不到发布按钮,选择器与视觉兜底均失败');
 *   }
 */
export async function clickWithVisionFallback(
  page: Page,
  primary: import('playwright').Locator,
  intent: string,
  options: { timeout?: number; frame?: import('playwright').Frame } = {}
): Promise<boolean> {
  const timeout = options.timeout ?? 5000;
  try {
    await primary.click({ timeout });
    return true;
  } catch {
    /* fall through to vision */
  }

  const loc = await locateWithVision(page, {
    intent,
    frame: options.frame
  });
  if (!loc) return false;
  try {
    // Input (mouse/keyboard) always goes through the Page — Frame exposes
    // neither. Coordinates from locateWithVision are already in page space.
    await page.mouse.click(loc.x, loc.y);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convenience: try to fill an input via a locator, fall back to clicking a
 * vision-located point then typing. Returns true on success.
 */
export async function fillWithVisionFallback(
  page: Page,
  primary: import('playwright').Locator,
  intent: string,
  text: string,
  options: { timeout?: number; frame?: import('playwright').Frame } = {}
): Promise<boolean> {
  const timeout = options.timeout ?? 5000;
  try {
    await primary.click({ timeout });
    await primary.fill(text);
    return true;
  } catch {
    /* fall through to vision */
  }

  const loc = await locateWithVision(page, {
    intent,
    frame: options.frame
  });
  if (!loc) return false;
  try {
    // Input (mouse/keyboard) always goes through the Page.
    await page.mouse.click(loc.x, loc.y);
    await page.waitForTimeout(200);
    await page.keyboard.type(text);
    return true;
  } catch {
    return false;
  }
}
