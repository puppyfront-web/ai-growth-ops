import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// 复用根 devDep @playwright/test 提供的 chromium 与浏览器二进制，
// 避免 tests 目录直接依赖 apps/browser-runner 的 playwright 版本。
import { chromium } from '@playwright/test';
import {
  extractCommentsFromDOM,
  extractSearchResultsFromDOM
} from '../../../apps/browser-runner/src/assist-routes.js';
import { detectCaptcha } from '../../../apps/browser-runner/src/captcha-detect.js';

/**
 * DOM 兜底提取器回归夹具（47 号 spec）：
 * 平台接口不可用时从页面 DOM 抢救数据的最后防线，此前零测试。
 * 真实平台改版后按 Runbook 抓 HTML 替换/追加夹具即可，无需改骨架。
 */

let browser: import('playwright').Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

async function pageWith(html: string) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  return page;
}

const SEARCH_FIXTURE = `
<body>
  <div id="other-area">
    <a href="/video/outside-999">容器外的同 pattern 链接不应收录</a>
  </div>
  <div id="search-result-container">
    <div>
      <a href="https://www.douyin.com/video/7111111111111">
        <div>AI Agent 开发实战教程，从零到一</div>
        <div>@技术博主A</div>
        <div>03:21</div>
      </a>
    </div>
    <div>
      <a href="https://www.douyin.com/video/7111111111111?duplicate=1">
        <div>AI Agent 开发实战教程，从零到一</div>
        <div>@技术博主A</div>
      </a>
    </div>
    <div>
      <a href="https://www.douyin.com/note/7222222222222">
        <div>图解如何用 AI 提升团队效率</div>
        <div>@效率笔记B</div>
      </a>
    </div>
  </div>
</body>`;

describe('extractSearchResultsFromDOM(douyin)', () => {
  it('提取 video 与 note 结果：去重、作者、note 类型标记、容器外排除', async () => {
    const page = await pageWith(SEARCH_FIXTURE);
    try {
      const results = await extractSearchResultsFromDOM(page, 'douyin');
      expect(results).toHaveLength(2);

      const video = results.find((r) => r.contentId === '7111111111111');
      expect(video).toMatchObject({
        author: '技术博主A',
        title: expect.stringContaining('AI Agent 开发实战教程'),
        awemeType: undefined
      });

      const note = results.find((r) => r.contentId === '7222222222222');
      expect(note).toMatchObject({
        author: '效率笔记B',
        awemeType: 2
      });
    } finally {
      await page.close();
    }
  });

  it('无搜索容器时返回空数组（平台改版的降级路径）', async () => {
    const page = await pageWith('<body><div>页面空了</div></body>');
    try {
      expect(await extractSearchResultsFromDOM(page, 'douyin')).toEqual([]);
    } finally {
      await page.close();
    }
  });
});

const COMMENT_FIXTURE = `
<body>
  <div id="comment-list">
    <div class="comment-item">
      <a href="https://www.douyin.com/user/MS4wLjABAAAA-sec-uid-111">
        <div>
          <div>张老板</div>
          <div>我们工厂正在选型，求一份报价单对比</div>
          <div>3天前</div>
          <div>1.2万</div>
          <img src="https://example.com/avatar-111.png" />
        </div>
      </a>
    </div>
    <div class="comment-item">
      <a href="https://www.douyin.com/user/MS4wLjABAAAA-sec-uid-222">
        <div>
          <div>李经理</div>
          <div>我们工厂正在选型，求一份报价单对比</div>
          <div>1小时前</div>
          <div>56</div>
        </div>
      </a>
    </div>
    <div class="comment-item">
      <a href="https://www.douyin.com/user/MS4wLjABAAAA-sec-uid-111">
        <div>
          <div>张老板</div>
          <div>我们工厂正在选型，求一份报价单对比</div>
          <div>刚刚</div>
        </div>
      </a>
    </div>
    <div class="comment-item noise">
      <a href="https://www.douyin.com/user/MS4wLjABAAAA-sec-uid-333">
        <div>回复</div>
      </a>
    </div>
  </div>
</body>`;

describe('extractCommentsFromDOM(douyin)', () => {
  it('提取合格评论：secUid、内容、点赞万单位换算、时间；噪声与重复项排除', async () => {
    const page = await pageWith(COMMENT_FIXTURE);
    try {
      const comments = await extractCommentsFromDOM(
        page,
        'douyin',
        'task-content-1'
      );

      // 噪声项（单行"回复"）与第三条重复项（同 username+content 前缀）被排除
      expect(comments).toHaveLength(2);

      const first = comments.find(
        (c) => c.externalUserId === 'MS4wLjABAAAA-sec-uid-111'
      ) as Record<string, unknown>;
      expect(first).toBeTruthy();
      expect(first.userNickname).toBe('张老板');
      expect(first.content).toBe('我们工厂正在选型，求一份报价单对比');
      expect(first.likeCount).toBe(12000);
      expect(first.publishedAt).toBe('3天前');
      expect(first.sourceContentId).toBe('task-content-1');
      expect(first.userHomepage).toBe(
        'https://www.douyin.com/user/MS4wLjABAAAA-sec-uid-111'
      );
      expect(first.avatarUrl).toBe('https://example.com/avatar-111.png');
      expect(String(first.externalCommentId)).toMatch(/^dom-/);

      const second = comments.find(
        (c) => c.externalUserId === 'MS4wLjABAAAA-sec-uid-222'
      ) as Record<string, unknown>;
      expect(second.likeCount).toBe(56);
    } finally {
      await page.close();
    }
  });
});

describe('detectCaptcha', () => {
  it.each(['请完成下列验证', '拖动完成上方拼图', '请完成安全验证'])(
    '命中验证码文案：%s',
    async (phrase) => {
      const page = await pageWith(`<body><div>${phrase}</div></body>`);
      try {
        expect(await detectCaptcha(page as never)).toBe(true);
      } finally {
        await page.close();
      }
    }
  );

  it('正常页面不误报', async () => {
    const page = await pageWith(
      '<body><div>抖音——记录美好生活</div></body>'
    );
    try {
      expect(await detectCaptcha(page as never)).toBe(false);
    } finally {
      await page.close();
    }
  });
});
