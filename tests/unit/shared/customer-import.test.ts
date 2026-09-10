import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  suggestCustomerMapping,
  mappingIsComplete
} from '../../../packages/shared/src/csv';
import {
  buildImportPreviewRows,
  summarizeImportPreview
} from '../../../packages/shared/src/customer-import';

describe('parseCsv', () => {
  it('parses quoted fields', () => {
    const rows = parseCsv('name,phone\n"张,三",13800138000');
    expect(rows[1][0]).toBe('张,三');
  });
});

describe('suggestCustomerMapping', () => {
  it('maps common English headers', () => {
    const mapping = suggestCustomerMapping([
      'name',
      'phone',
      'company',
      'role',
      'intent'
    ]);
    expect(mappingIsComplete(mapping)).toBe(true);
    expect(mapping.displayName).toBe(0);
    expect(mapping.phone).toBe(1);
  });

  it('maps Chinese headers', () => {
    const mapping = suggestCustomerMapping([
      '姓名',
      '手机号',
      '公司',
      '职位',
      '需求'
    ]);
    expect(mappingIsComplete(mapping)).toBe(true);
  });
});

describe('customer import preview', () => {
  const mapping = {
    displayName: 0,
    phone: 1,
    company: 2,
    role: 3,
    intent: 4
  };

  it('flags invalid and duplicate rows', () => {
    const rows = buildImportPreviewRows(
      [
        ['张三', '13800138000', 'A公司', '经理', '需求1'],
        ['李四', '123', 'B公司', '总监', '需求2'],
        ['王五', '13800138000', 'C公司', '主管', '需求3']
      ],
      mapping,
      new Map([
        [
          '13800138000',
          { id: 'c1', displayName: '已有客户', company: 'X公司' }
        ]
      ])
    );

    expect(rows[0].issues).toContain('duplicate_in_db');
    expect(rows[1].issues).toContain('invalid_phone');
    expect(rows[2].issues).toContain('duplicate_in_file');

    const summary = summarizeImportPreview(rows);
    expect(summary.duplicateDb).toBe(2);
    expect(summary.duplicateFile).toBe(1);
    expect(summary.invalid).toBe(1);
    expect(summary.ready).toBe(0);
  });
});
