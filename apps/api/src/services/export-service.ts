/**
 * Export Service
 *
 * Generic CSV export with BOM for Chinese character compatibility.
 */

interface ExportColumn {
  key: string;
  label: string;
  transform?: (value: unknown, row: Record<string, unknown>) => string;
}

/**
 * Convert data array to CSV string with UTF-8 BOM
 */
export function exportToCSV(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
): string {
  // UTF-8 BOM for Excel compatibility with Chinese characters
  const BOM = '﻿';

  const header = columns.map(c => escapeCSV(c.label)).join(',');
  const rows = data.map(row =>
    columns.map(col => {
      const raw = row[col.key];
      if (col.transform) return escapeCSV(col.transform(raw, row));
      if (raw === null || raw === undefined) return '';
      if (typeof raw === 'object') {
        // Dates
        if (raw instanceof Date) return escapeCSV(raw.toISOString());
        return escapeCSV(JSON.stringify(raw));
      }
      return escapeCSV(String(raw));
    }).join(',')
  );

  return BOM + header + '\n' + rows.join('\n');
}

/**
 * Escape a CSV field (handle commas, quotes, newlines)
 */
function escapeCSV(value: string): string {
  if (!value) return '""';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

// ── Predefined export column sets ────────────────────────────────────────

export const LEAD_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: '姓名' },
  { key: 'phone', label: '手机号' },
  { key: 'email', label: '邮箱' },
  { key: 'company', label: '公司' },
  { key: 'source', label: '来源' },
  { key: 'level', label: '等级' },
  { key: 'score', label: '评分' },
  { key: 'status', label: '状态' },
  { key: 'tags', label: '标签', transform: (v) => Array.isArray(v) ? v.join(';') : String(v ?? '') },
  { key: 'createdAt', label: '创建时间', transform: (v) => v ? new Date(v as string).toLocaleString('zh-CN') : '' },
  { key: 'updatedAt', label: '更新时间', transform: (v) => v ? new Date(v as string).toLocaleString('zh-CN') : '' },
];

export const CONTENT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: '标题' },
  { key: 'status', label: '状态' },
  { key: 'contentType', label: '类型' },
  { key: 'platform', label: '平台' },
  { key: 'author', label: '作者' },
  { key: 'createdAt', label: '创建时间', transform: (v) => v ? new Date(v as string).toLocaleString('zh-CN') : '' },
];

export const INTERACTION_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'id', label: 'ID' },
  { key: 'type', label: '类型' },
  { key: 'platform', label: '平台' },
  { key: 'content', label: '内容' },
  { key: 'externalUserName', label: '用户名' },
  { key: 'status', label: '状态' },
  { key: 'createdAt', label: '时间', transform: (v) => v ? new Date(v as string).toLocaleString('zh-CN') : '' },
];
