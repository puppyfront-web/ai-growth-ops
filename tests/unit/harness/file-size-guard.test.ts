import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 文件尺寸守卫（45 号 spec）：源码文件 ≤800 行（AI 维护者的上下文粒度）。
 * 存量超限文件进入冻结清单——只许缩小、不许增长；新文件一律受限。
 */

const MAX_LINES = 800;

/** 2026-11-03 基线：存量超限文件 → 冻结行数（只减不增）
 * 2026-11-03 spec/53 全链路交付（T2 回复回写、T4 leadSummary、T1/T3 转化汇合）
 * 触发 routes.ts / prospecting.ts 超出旧基线，基线随之更新，仍只减不增。 */
const FROZEN: Record<string, number> = {
  'apps/api/src/routes.ts': 7126,
  'apps/browser-runner/src/assist-routes.ts': 3064,
  'packages/database/src/prospecting.ts': 1962,
  'apps/api/src/routes-customers.ts': 1064,
  'apps/api/src/routes-prospecting.ts': 1062,
  'packages/database/src/outreach.ts': 944,
  'apps/web/src/app/(dashboard)/integrations/platforms/page.tsx': 870,
  'apps/worker/src/job-handlers/interaction-pipeline.ts': 900
};

const ROOT = join(__dirname, '../../../');
const SCAN_DIRS = ['apps/api/src', 'apps/web/src', 'apps/worker/src'];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function countLines(file: string): number {
  return readFileSync(file, 'utf8').trimEnd().split('\n').length;
}

describe('文件尺寸守卫', () => {
  const files = SCAN_DIRS.flatMap((dir) => listSourceFiles(join(ROOT, dir)));

  it('扫描范围内存在文件（守卫自身生效性）', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('新增/存量文件不超过 800 行', () => {
    const oversize: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file);
      if (rel in FROZEN) continue;
      if (countLines(file) > MAX_LINES) oversize.push(rel);
    }
    expect(
      oversize,
      `以下文件超过 ${MAX_LINES} 行，请拆分（若确需豁免须更新 spec/45 冻结清单并说明理由）：\n${oversize.join('\n')}`
    ).toEqual([]);
  });

  it('冻结清单中的文件不得增长', () => {
    const grown: string[] = [];
    for (const [rel, frozen] of Object.entries(FROZEN)) {
      const current = countLines(join(ROOT, rel));
      if (current > frozen) grown.push(`${rel}: ${current} > ${frozen}`);
    }
    expect(
      grown,
      `冻结文件只许缩小不许增长：\n${grown.join('\n')}`
    ).toEqual([]);
  });

  it('冻结清单条目仍然超限（清单未过期）', () => {
    const stale: string[] = [];
    for (const rel of Object.keys(FROZEN)) {
      if (countLines(join(ROOT, rel)) <= MAX_LINES) stale.push(rel);
    }
    expect(stale, `以下文件已低于上限，请从冻结清单移除：\n${stale.join('\n')}`).toEqual([]);
  });
});
