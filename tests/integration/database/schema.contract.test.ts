import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createDatabaseClient } from '../../../packages/database/src';

describe('database schema contract', () => {
  it('exports a database client factory', () => {
    expect(createDatabaseClient).toBeTypeOf('function');
  });

  it('declares the required M1 models in the Prisma schema', () => {
    const schema = readFileSync(
      'packages/database/prisma/schema.prisma',
      'utf8'
    );

    expect(schema).toContain('model User');
    expect(schema).toContain('model PlatformAccount');
    expect(schema).toContain('model PlatformCapability');
    expect(schema).toContain('model ContentProject');
    expect(schema).toContain('model ContentItem');
    expect(schema).toContain('model ContentVariant');
    expect(schema).toContain('model MediaAsset');
    expect(schema).toContain('model PublishJob');
    expect(schema).toContain('model PublishAttempt');
    expect(schema).toContain('model Lead');
    expect(schema).toContain('model Conversation');
    expect(schema).toContain('model ResearchTask');
    expect(schema).toContain('model ProviderRunLog');
    expect(schema).toContain('model AuditLog');
  });

  it('declares the core unique constraints required by M1', () => {
    const schema = readFileSync(
      'packages/database/prisma/schema.prisma',
      'utf8'
    );

    expect(schema).toContain('@@unique([userId, platform, name])');
    expect(schema).toContain(
      '@@unique([contentItemId, platform, contentType])'
    );
    expect(schema).toContain(
      '@@unique([contentVariantId, platformAccountId, mode])'
    );
    expect(schema).toContain(
      '@@unique([platformAccountId, externalInteractionId])'
    );
    expect(schema).toContain(
      '@@unique([sourcePlatform, sourceAccountId, externalUserId])'
    );
  });
});
