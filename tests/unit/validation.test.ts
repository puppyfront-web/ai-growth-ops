import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Test validation patterns used in the API
describe('Zod Validation - Auth Schemas', () => {
  const loginSchema = z.object({
    email: z.string().email('请输入有效的邮箱地址'),
    password: z.string().min(1, '请输入密码'),
  });

  const registerSchema = z.object({
    email: z.string().email('请输入有效的邮箱地址'),
    password: z.string().min(8, '密码至少 8 个字符'),
    name: z.string().min(1, '请输入姓名').max(50, '姓名不超过 50 个字符'),
  });

  describe('loginSchema', () => {
    it('validates correct input', () => {
      const result = loginSchema.safeParse({ email: 'test@example.com', password: 'secret' });
      expect(result.success).toBe(true);
    });

    it('rejects empty email', () => {
      const result = loginSchema.safeParse({ email: '', password: 'secret' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid email', () => {
      const result = loginSchema.safeParse({ email: 'not-an-email', password: 'secret' });
      expect(result.success).toBe(false);
    });

    it('rejects missing password', () => {
      const result = loginSchema.safeParse({ email: 'test@example.com', password: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('registerSchema', () => {
    it('validates correct input', () => {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
        password: 'securepassword',
        name: 'Test User',
      });
      expect(result.success).toBe(true);
    });

    it('rejects short password', () => {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
        password: 'short',
        name: 'Test',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const pwError = result.error.issues.find(i => i.path[0] === 'password');
        expect(pwError).toBeDefined();
      }
    });

    it('rejects empty name', () => {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
        password: 'longpassword',
        name: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects extra-long name', () => {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
        password: 'longpassword',
        name: 'x'.repeat(51),
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Zod Validation - Content Schemas', () => {
  const createContentSchema = z.object({
    title: z.string().min(1, '标题不能为空').max(200, '标题不超过 200 字符'),
    contentType: z.enum(['text_image', 'video', 'article']),
    body: z.string().optional(),
    tags: z.array(z.string()).optional(),
  });

  it('validates text_image content', () => {
    const result = createContentSchema.safeParse({
      title: 'My Content',
      contentType: 'text_image',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid contentType', () => {
    const result = createContentSchema.safeParse({
      title: 'Test',
      contentType: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts tags array', () => {
    const result = createContentSchema.safeParse({
      title: 'Test',
      contentType: 'article',
      tags: ['ai', 'marketing'],
    });
    expect(result.success).toBe(true);
  });
});
