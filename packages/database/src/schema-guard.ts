import type { DatabaseClient } from './client.js';

/** Columns that must exist for CRM / prospecting flows to work. */
const REQUIRED_COLUMNS: Record<string, string[]> = {
  prospect_candidates: [
    'userKey',
    'userHomepage',
    'avatarUrl',
    'commentCount',
    'evidence',
    'scoreSource'
  ],
  prospecting_tasks: ['executionToken', 'metadata'],
  organization_icp_configs: ['value'],
  customer_playbooks: ['summary', 'actions', 'status', 'generatedBy'],
  customer_profiles: ['summary', 'bant', 'companySize']
};

export type SchemaCheckResult = {
  ok: boolean;
  missing: Array<{ table: string; column: string }>;
};

export async function verifyDatabaseSchema(
  db: DatabaseClient
): Promise<SchemaCheckResult> {
  const missing: Array<{ table: string; column: string }> = [];

  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const rows = await db.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      table
    );
    const present = new Set(rows.map((r) => r.column_name));
    if (present.size === 0) {
      for (const column of columns) {
        missing.push({ table, column });
      }
      continue;
    }
    for (const column of columns) {
      if (!present.has(column)) {
        missing.push({ table, column });
      }
    }
  }

  return { ok: missing.length === 0, missing };
}
