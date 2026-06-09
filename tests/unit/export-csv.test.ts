import { describe, it, expect } from 'vitest';
import { exportToCSV } from '../../apps/api/src/services/export-service.js';

describe('Export Service - exportToCSV', () => {
  it('generates CSV with BOM', () => {
    const csv = exportToCSV(
      [{ name: 'Alice', age: 30 }],
      [
        { key: 'name', label: '姓名' },
        { key: 'age', label: '年龄' }
      ]
    );
    // UTF-8 BOM
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('generates correct header', () => {
    const csv = exportToCSV(
      [],
      [
        { key: 'name', label: '姓名' },
        { key: 'age', label: '年龄' }
      ]
    );
    expect(csv).toContain('姓名,年龄');
  });

  it('generates correct rows', () => {
    const csv = exportToCSV(
      [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 }
      ],
      [
        { key: 'name', label: '姓名' },
        { key: 'age', label: '年龄' }
      ]
    );
    expect(csv).toContain('Alice,30');
    expect(csv).toContain('Bob,25');
  });

  it('handles fields with commas', () => {
    const csv = exportToCSV(
      [{ name: 'Alice, Bob', age: 30 }],
      [
        { key: 'name', label: '姓名' },
        { key: 'age', label: '年龄' }
      ]
    );
    expect(csv).toContain('"Alice, Bob"');
  });

  it('handles fields with quotes', () => {
    const csv = exportToCSV(
      [{ name: 'Alice "The Boss"', age: 30 }],
      [
        { key: 'name', label: '姓名' },
        { key: 'age', label: '年龄' }
      ]
    );
    expect(csv).toContain('"Alice ""The Boss"""');
  });

  it('handles null/undefined values', () => {
    const csv = exportToCSV(
      [{ name: null, age: undefined }],
      [
        { key: 'name', label: '姓名' },
        { key: 'age', label: '年龄' }
      ]
    );
    // null/undefined become empty strings
    const lines = csv.split('\n');
    // Just verify no 'null' or 'undefined' text appears and row exists
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const dataRow = lines[1];
    expect(dataRow).not.toContain('null');
    expect(dataRow).not.toContain('undefined');
  });

  it('uses transform function when provided', () => {
    const csv = exportToCSV(
      [{ tags: ['ai', 'marketing'] }],
      [
        {
          key: 'tags',
          label: '标签',
          transform: (v) =>
            Array.isArray(v) ? (v as string[]).join(';') : String(v ?? '')
        }
      ]
    );
    expect(csv).toContain('ai;marketing');
  });

  it('handles Chinese characters', () => {
    const csv = exportToCSV(
      [{ name: '张三', city: '北京' }],
      [
        { key: 'name', label: '姓名' },
        { key: 'city', label: '城市' }
      ]
    );
    expect(csv).toContain('张三');
    expect(csv).toContain('北京');
  });
});
