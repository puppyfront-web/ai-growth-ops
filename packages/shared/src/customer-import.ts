import { isValidPhone, normalizePhone } from './phone.js';
import type { CustomerColumnMapping, CustomerImportField } from './csv.js';

export type ParsedCustomerRow = {
  rowNumber: number;
  displayName: string;
  phone: string;
  normalizedPhone: string;
  company: string;
  role: string;
  intent: string;
  channel: string;
  sourceNote: string;
};

export type CustomerImportRowIssue =
  | 'missing_displayName'
  | 'missing_phone'
  | 'invalid_phone'
  | 'missing_company'
  | 'missing_role'
  | 'missing_intent'
  | 'duplicate_in_file'
  | 'duplicate_in_db';

export type CustomerImportPreviewRow = {
  rowNumber: number;
  data: Partial<ParsedCustomerRow>;
  issues: CustomerImportRowIssue[];
  existingCustomer?: {
    id: string;
    displayName: string;
    phone: string;
    company: string;
  };
};

const VALID_CHANNELS = new Set([
  'douyin',
  'xiaohongshu',
  'wechat_official',
  'wechat_channels',
  'baijiahao',
  'zhihu',
  'manual',
  'import',
  'referral',
  'exhibition',
  'phone',
  'website',
  'partner',
  'other'
]);

function cell(row: string[], index: number | undefined): string {
  if (index == null || index < 0) return '';
  return (row[index] ?? '').trim();
}

export function extractCustomerRow(
  row: string[],
  rowNumber: number,
  mapping: CustomerColumnMapping
): ParsedCustomerRow {
  const rawPhone = cell(row, mapping.phone);
  const normalizedPhone = rawPhone ? normalizePhone(rawPhone) : '';
  const rawChannel = cell(row, mapping.channel) || 'import';
  const channel = VALID_CHANNELS.has(rawChannel) ? rawChannel : 'import';

  return {
    rowNumber,
    displayName: cell(row, mapping.displayName),
    phone: rawPhone,
    normalizedPhone,
    company: cell(row, mapping.company),
    role: cell(row, mapping.role),
    intent: cell(row, mapping.intent),
    channel,
    sourceNote: cell(row, mapping.sourceNote)
  };
}

export function validateCustomerRow(
  data: ParsedCustomerRow
): CustomerImportRowIssue[] {
  const issues: CustomerImportRowIssue[] = [];
  if (!data.displayName) issues.push('missing_displayName');
  if (!data.phone) issues.push('missing_phone');
  else if (!isValidPhone(data.phone)) issues.push('invalid_phone');
  if (!data.company) issues.push('missing_company');
  if (!data.role) issues.push('missing_role');
  if (!data.intent) issues.push('missing_intent');
  return issues;
}

export function buildImportPreviewRows(
  dataRows: string[][],
  mapping: CustomerColumnMapping,
  existingPhones: Map<string, { id: string; displayName: string; phone: string; company: string }>
): CustomerImportPreviewRow[] {
  const seenPhones = new Set<string>();
  const preview: CustomerImportPreviewRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2;
    const row = dataRows[i];
    if (!row.length || row.every((c) => !c.trim())) continue;

    const data = extractCustomerRow(row, rowNumber, mapping);
    const issues = validateCustomerRow(data);

    if (data.normalizedPhone) {
      if (seenPhones.has(data.normalizedPhone)) {
        issues.push('duplicate_in_file');
      } else {
        seenPhones.add(data.normalizedPhone);
      }

      const existing = existingPhones.get(data.normalizedPhone);
      if (existing) {
        issues.push('duplicate_in_db');
      }
    }

    preview.push({
      rowNumber,
      data,
      issues,
      existingCustomer: data.normalizedPhone
        ? existingPhones.get(data.normalizedPhone)
        : undefined
    });
  }

  return preview;
}

export function summarizeImportPreview(rows: CustomerImportPreviewRow[]) {
  let ready = 0;
  let invalid = 0;
  let duplicateDb = 0;
  let duplicateFile = 0;

  for (const row of rows) {
    const hasInvalid = row.issues.some(
      (i) =>
        i.startsWith('missing_') || i === 'invalid_phone'
    );
    const hasDupDb = row.issues.includes('duplicate_in_db');
    const hasDupFile = row.issues.includes('duplicate_in_file');

    if (hasInvalid) invalid++;
    if (hasDupDb) duplicateDb++;
    if (hasDupFile) duplicateFile++;
    if (!hasInvalid && !hasDupDb && !hasDupFile) ready++;
  }

  return {
    total: rows.length,
    ready,
    invalid,
    duplicateDb,
    duplicateFile
  };
}

export function rowsEligibleForImport(
  rows: CustomerImportPreviewRow[],
  skipDuplicates: boolean
): CustomerImportPreviewRow[] {
  return rows.filter((row) => {
    const hasInvalid = row.issues.some(
      (i) =>
        i.startsWith('missing_') || i === 'invalid_phone'
    );
    if (hasInvalid) return false;
    if (skipDuplicates && row.issues.includes('duplicate_in_db')) return false;
    if (row.issues.includes('duplicate_in_file')) return false;
    return true;
  });
}

export const IMPORT_ISSUE_LABELS: Record<CustomerImportRowIssue, string> = {
  missing_displayName: '缺少姓名',
  missing_phone: '缺少手机号',
  invalid_phone: '手机号无效',
  missing_company: '缺少公司',
  missing_role: '缺少职位',
  missing_intent: '缺少需求',
  duplicate_in_file: '文件内手机号重复',
  duplicate_in_db: '系统中已存在'
};

export type { CustomerImportField };
