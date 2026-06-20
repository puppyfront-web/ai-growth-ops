import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface ScannedFile {
  path: string;
  content: string;
}

export interface DriftRule {
  id: string;
  severity: 'error' | 'warn';
  filePatterns: RegExp[];
  contentPatterns: RegExp[];
  message: string;
}

export interface DriftFinding {
  ruleId: string;
  severity: 'error' | 'warn';
  filePath: string;
  message: string;
  matchedPattern: string;
}

export interface DriftEvaluation {
  errors: DriftFinding[];
  warnings: DriftFinding[];
}

const DEFAULT_SCAN_DIRS = [
  'apps/api/src',
  'apps/web/src',
  'apps/worker/src',
  'packages/ai-tools/src',
  'packages/connectors/src',
  'packages/skills/src',
  'packages/runtime/src'
];

export const defaultDriftRules: DriftRule[] = [
  {
    id: 'no-connectors-to-web-chat',
    severity: 'error',
    filePatterns: [/^packages\/connectors\/src\/.*\.(ts|tsx)$/],
    contentPatterns: [
      /from\s+['"][^'"]*apps\/web\/src\/app\/api\/chat[^'"]*['"]/,
      /import\s*\(\s*['"][^'"]*apps\/web\/src\/app\/api\/chat[^'"]*['"]\s*\)/
    ],
    message: 'connectors must not depend on web chat entrypoints'
  },
  {
    id: 'no-connectors-to-task-engine',
    severity: 'error',
    filePatterns: [/^packages\/connectors\/src\/.*\.(ts|tsx)$/],
    contentPatterns: [/@ai-growth-ops\/task-engine/, /packages\/task-engine/],
    message: 'connectors must not generate tasks or depend on task-engine'
  },
  {
    id: 'no-server-imports-of-web-chat',
    severity: 'error',
    filePatterns: [
      /^apps\/api\/src\/.*\.(ts|tsx)$/,
      /^apps\/worker\/src\/.*\.(ts|tsx)$/,
      /^packages\/.*\/src\/.*\.(ts|tsx)$/
    ],
    contentPatterns: [
      /from\s+['"][^'"]*apps\/web\/src\/app\/api\/chat[^'"]*['"]/,
      /import\s*\(\s*['"][^'"]*apps\/web\/src\/app\/api\/chat[^'"]*['"]\s*\)/
    ],
    message: 'server and shared packages must not depend on web chat handlers'
  },
  {
    id: 'legacy-workflowexecution',
    severity: 'warn',
    filePatterns: [/^(apps|packages)\/.*\.(ts|tsx|prisma)$/],
    contentPatterns: [/\bWorkflowExecution\b/],
    message:
      'legacy WorkflowExecution usage is still present and should be migrated into AgentRun + PlanStepRun'
  },
  {
    id: 'legacy-workflow-queue',
    severity: 'warn',
    filePatterns: [/^apps\/.*\.(ts|tsx)$/],
    contentPatterns: [/workflow\.execute/],
    message:
      'legacy workflow.execute queue usage should eventually be replaced by unified AgentRun execution'
  },
  {
    id: 'legacy-execute-plan-echo',
    severity: 'warn',
    filePatterns: [/^(apps|packages)\/.*\.(ts|tsx)$/],
    contentPatterns: [/\bexecute_plan\b/],
    message:
      'execute_plan still exists; ensure it converges on unified AgentRun ownership instead of plan echoing'
  },
  {
    id: 'no-runtime-depends-on-apps',
    severity: 'error',
    filePatterns: [/^packages\/runtime\/src\/.*\.(ts|tsx)$/],
    contentPatterns: [
      /from\s+['"](\.\.\/)+apps\//,
      /import\s*\(\s*['"](\.\.\/)+apps\//,
      /from\s+['"]@ai-growth-ops\/(api|web|worker|browser-runner)['"]/,
      /import\s*\(\s*['"]@ai-growth-ops\/(api|web|worker|browser-runner)['"]/
    ],
    message:
      'runtime kernel must stay runtime-agnostic — no imports from apps/*'
  }
];

function shouldIncludeFile(path: string) {
  return /\.(ts|tsx|prisma|md)$/.test(path);
}

function walk(dir: string, rootDir: string, files: ScannedFile[]) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, rootDir, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const relPath = relative(rootDir, fullPath).replaceAll('\\', '/');
    if (!shouldIncludeFile(relPath)) continue;
    files.push({
      path: relPath,
      content: readFileSync(fullPath, 'utf8')
    });
  }
}

export function collectFiles(
  rootDir: string,
  dirs: string[] = DEFAULT_SCAN_DIRS
): ScannedFile[] {
  const files: ScannedFile[] = [];
  for (const dir of dirs) {
    const fullDir = join(rootDir, dir);
    try {
      if (!statSync(fullDir).isDirectory()) continue;
      walk(fullDir, rootDir, files);
    } catch {
      continue;
    }
  }
  return files;
}

export function evaluateArchitectureDrift(
  files: ScannedFile[],
  rules: DriftRule[] = defaultDriftRules
): DriftEvaluation {
  const errors: DriftFinding[] = [];
  const warnings: DriftFinding[] = [];

  for (const file of files) {
    for (const rule of rules) {
      const fileMatches = rule.filePatterns.some((pattern) =>
        pattern.test(file.path)
      );
      if (!fileMatches) continue;

      for (const pattern of rule.contentPatterns) {
        if (!pattern.test(file.content)) continue;
        const finding: DriftFinding = {
          ruleId: rule.id,
          severity: rule.severity,
          filePath: file.path,
          message: rule.message,
          matchedPattern: pattern.source
        };
        if (rule.severity === 'error') {
          errors.push(finding);
        } else {
          warnings.push(finding);
        }
      }
    }
  }

  return { errors, warnings };
}

function printFindings(label: string, findings: DriftFinding[]) {
  if (findings.length === 0) return;
  console.log(`${label}:`);
  for (const finding of findings) {
    console.log(
      `- [${finding.ruleId}] ${finding.filePath}: ${finding.message} (${finding.matchedPattern})`
    );
  }
}

async function main() {
  const rootDir = process.cwd();
  const files = collectFiles(rootDir);
  const result = evaluateArchitectureDrift(files);

  printFindings('Architecture drift warnings', result.warnings);
  printFindings('Architecture drift errors', result.errors);

  if (result.errors.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(
    `Architecture drift check passed with ${result.warnings.length} warning(s).`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
