import type { Page } from 'playwright';

export async function detectCaptcha(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const text = document.body.innerText;
    return (
      text.includes('请完成下列验证') ||
      text.includes('拖动完成上方拼图') ||
      text.includes('请完成安全验证')
    );
  });
}
