import { describe, it, expect } from 'vitest';
import { createDbCredentialResolver } from '../../../apps/worker/src/credentials';

describe('createDbCredentialResolver', () => {
  it('returns decrypted cookie for an active account', async () => {
    const db = {
      platformAccount: { findFirst: async () => ({ cookieRef: 'enc' }) }
    } as never;
    const r = createDbCredentialResolver(db, async (e) => `dec(${e})` as string);
    await expect(r.getCookie('u', 'o', 'douyin')).resolves.toBe('dec(enc)');
  });

  it('returns undefined when no account found', async () => {
    const db = { platformAccount: { findFirst: async () => null } } as never;
    const r = createDbCredentialResolver(db, () => 'x');
    await expect(r.getCookie('u', 'o', 'douyin')).resolves.toBeUndefined();
  });

  it('returns undefined when account has no cookieRef', async () => {
    const db = { platformAccount: { findFirst: async () => ({ cookieRef: null }) } } as never;
    const r = createDbCredentialResolver(db, () => 'x');
    await expect(r.getCookie('u', 'o', 'douyin')).resolves.toBeUndefined();
  });

  it('returns undefined (not throw) when decrypt fails', async () => {
    const db = { platformAccount: { findFirst: async () => ({ cookieRef: 'bad' }) } } as never;
    const r = createDbCredentialResolver(db, () => {
      throw new Error('undecryptable');
    });
    await expect(r.getCookie('u', 'o', 'douyin')).resolves.toBeUndefined();
  });

  it('queries by userId + platform + active status', async () => {
    const calls: unknown[] = [];
    const db = {
      platformAccount: {
        findFirst: async (args: unknown) => {
          calls.push(args);
          return null;
        }
      }
    } as never;
    const r = createDbCredentialResolver(db, () => 'x');
    await r.getCookie('user-9', 'org-1', 'douyin');
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0])).toContain('user-9');
    expect(JSON.stringify(calls[0])).toContain('douyin');
    expect(JSON.stringify(calls[0])).toContain('active');
  });
});
