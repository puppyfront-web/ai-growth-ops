import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(8, '密码至少 8 个字符'),
});

describe('Login Zod Schema', () => {
  it('passes with valid input', () => {
    const result = loginSchema.safeParse({ email: 'test@test.com', password: '12345678' });
    expect(result.success).toBe(true);
  });

  it('fails with invalid email', () => {
    const result = loginSchema.safeParse({ email: 'invalid', password: '12345678' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('邮箱');
    }
  });

  it('fails with short password', () => {
    const result = loginSchema.safeParse({ email: 'test@test.com', password: '123' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('8');
    }
  });

  it('fails with missing fields', () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
    }
  });
});
