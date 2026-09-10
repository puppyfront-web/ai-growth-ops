import type { DatabaseClient } from '@ai-growth-ops/database';
import {
  buildImportPreviewRows,
  extractCustomerRow,
  mappingIsComplete,
  parseCsv,
  rowsEligibleForImport,
  suggestCustomerMapping,
  summarizeImportPreview,
  type CustomerColumnMapping,
  type CustomerImportPreviewRow
} from '@ai-growth-ops/shared';

export type CustomerImportPreviewResult = {
  headers: string[];
  suggestedMapping: CustomerColumnMapping;
  mapping: CustomerColumnMapping;
  rows: CustomerImportPreviewRow[];
  summary: ReturnType<typeof summarizeImportPreview>;
};

export type CustomerImportExecuteResult = {
  created: number;
  skipped: number;
  errors: string[];
  createdCustomerIds: string[];
};

async function loadExistingPhones(
  db: DatabaseClient,
  organizationId: string,
  phones: string[]
) {
  const map = new Map<
    string,
    { id: string; displayName: string; phone: string; company: string }
  >();
  if (phones.length === 0) return map;

  const existing = await db.customer.findMany({
    where: {
      organizationId,
      phone: { in: phones },
      deletedAt: null
    },
    select: {
      id: true,
      displayName: true,
      phone: true,
      company: true
    }
  });

  for (const c of existing) {
    map.set(c.phone, {
      id: c.id,
      displayName: c.displayName,
      phone: c.phone,
      company: c.company
    });
  }
  return map;
}

function parseCustomerCsv(csv: string) {
  const rows = parseCsv(csv.trim());
  if (rows.length < 2) {
    throw new Error('CSV 至少需要表头 + 1 行数据');
  }
  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);
  return { headers, dataRows };
}

export async function previewCustomerImport(
  db: DatabaseClient,
  organizationId: string,
  csv: string,
  mappingOverride?: CustomerColumnMapping
): Promise<CustomerImportPreviewResult> {
  const { headers, dataRows } = parseCustomerCsv(csv);
  const suggestedMapping = suggestCustomerMapping(headers);
  const mapping = { ...suggestedMapping, ...mappingOverride };

  if (!mappingIsComplete(mapping)) {
    throw new Error('字段映射不完整，请映射姓名、手机号、公司、职位、需求');
  }

  const parsed = dataRows.map((row, i) =>
    extractCustomerRow(row, i + 2, mapping)
  );
  const phones = parsed
    .map((r) => r.normalizedPhone)
    .filter((p) => p.length > 0);

  const existingPhones = await loadExistingPhones(db, organizationId, phones);
  const previewRows = buildImportPreviewRows(
    dataRows,
    mapping,
    existingPhones
  );

  return {
    headers,
    suggestedMapping,
    mapping,
    rows: previewRows,
    summary: summarizeImportPreview(previewRows)
  };
}

export async function executeCustomerImport(
  db: DatabaseClient,
  params: {
    organizationId: string;
    userId: string;
    operatorName: string;
    csv: string;
    mapping?: CustomerColumnMapping;
    skipDuplicates?: boolean;
  }
): Promise<CustomerImportExecuteResult> {
  const preview = await previewCustomerImport(
    db,
    params.organizationId,
    params.csv,
    params.mapping
  );

  const skipDuplicates = params.skipDuplicates !== false;
  const eligible = rowsEligibleForImport(preview.rows, skipDuplicates);

  let created = 0;
  let skipped = preview.rows.length - eligible.length;
  const errors: string[] = [];
  const createdCustomerIds: string[] = [];

  for (const row of eligible) {
    const data = row.data as {
      displayName: string;
      normalizedPhone: string;
      company: string;
      role: string;
      intent: string;
      channel: string;
      sourceNote: string;
    };

    try {
      const createdCustomer = await db.customer.create({
        data: {
          organizationId: params.organizationId,
          userId: params.userId,
          displayName: data.displayName,
          phone: data.normalizedPhone,
          company: data.company,
          role: data.role,
          intent: data.intent,
          channel: data.channel as never,
          sourceNote: data.sourceNote || undefined,
          activities: {
            create: {
              action: 'imported',
              note: '批量 CSV 导入',
              operator: params.operatorName
            }
          }
        }
      });
      createdCustomerIds.push(createdCustomer.id);
      created++;
    } catch (e) {
      errors.push(`第 ${row.rowNumber} 行导入失败: ${(e as Error).message}`);
      skipped++;
    }
  }

  return { created, skipped, errors: errors.slice(0, 50), createdCustomerIds };
}
