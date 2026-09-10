/** Minimal RFC-style CSV parser (comma-separated, quoted fields). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export type CustomerImportField =
  | 'displayName'
  | 'phone'
  | 'company'
  | 'role'
  | 'intent'
  | 'channel'
  | 'sourceNote';

export const CUSTOMER_IMPORT_FIELDS: CustomerImportField[] = [
  'displayName',
  'phone',
  'company',
  'role',
  'intent',
  'channel',
  'sourceNote'
];

export const CUSTOMER_FIELD_LABELS: Record<CustomerImportField, string> = {
  displayName: '姓名',
  phone: '手机号',
  company: '公司',
  role: '职位',
  intent: '需求',
  channel: '来源渠道',
  sourceNote: '来源说明'
};

const FIELD_ALIASES: Record<CustomerImportField, string[]> = {
  displayName: ['name', 'displayname', 'display_name', '姓名', '客户名称', '联系人'],
  phone: ['phone', 'mobile', 'tel', '手机号', '电话', '联系电话'],
  company: ['company', 'org', 'organization', '公司', '企业', '单位'],
  role: ['role', 'title', 'position', 'job', '职位', '职务', '岗位'],
  intent: ['intent', 'need', 'requirement', '需求', '意向', '备注', 'summary'],
  channel: ['channel', 'source', '来源', '来源渠道', '渠道'],
  sourceNote: ['source_note', 'sourcenote', '来源说明', '来源备注', '说明']
};

export type CustomerColumnMapping = Partial<
  Record<CustomerImportField, number>
>;

export function suggestCustomerMapping(headers: string[]): CustomerColumnMapping {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const mapping: CustomerColumnMapping = {};

  for (const field of CUSTOMER_IMPORT_FIELDS) {
    const aliases = FIELD_ALIASES[field];
    const index = normalized.findIndex((h) => aliases.includes(h));
    if (index >= 0) mapping[field] = index;
  }

  return mapping;
}

export function mappingIsComplete(
  mapping: CustomerColumnMapping
): mapping is Record<
  'displayName' | 'phone' | 'company' | 'role' | 'intent',
  number
> {
  return (
    mapping.displayName != null &&
    mapping.phone != null &&
    mapping.company != null &&
    mapping.role != null &&
    mapping.intent != null
  );
}

export const CUSTOMER_IMPORT_TEMPLATE = `name,phone,company,role,intent,channel,source_note
张三,13800138000,某某科技,采购经理,想了解企业版,exhibition,2026深圳展会
李四,13900139000,示例公司,市场总监,价格咨询,referral,老客户介绍`;
