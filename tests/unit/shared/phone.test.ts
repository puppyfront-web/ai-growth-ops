import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  isValidPhone
} from '../../../packages/shared/src/phone';

describe('normalizePhone', () => {
  it('strips non-digits', () => {
    expect(normalizePhone('138-0013-8000')).toBe('13800138000');
  });

  it('strips CN country code 86', () => {
    expect(normalizePhone('+86 138 0013 8000')).toBe('13800138000');
  });
});

describe('isValidPhone', () => {
  it('accepts 11-digit mobile', () => {
    expect(isValidPhone('13800138000')).toBe(true);
  });

  it('rejects invalid numbers', () => {
    expect(isValidPhone('12345')).toBe(false);
  });
});
