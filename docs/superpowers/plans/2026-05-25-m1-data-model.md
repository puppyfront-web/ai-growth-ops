# M1 Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the stage-2 database foundation with Prisma schema, PostgreSQL migration, seed data, and repository coverage for the AI growth ops MVP.

**Architecture:** Keep all database concerns inside `packages/database`, with Prisma as the schema and client boundary, lightweight repository helpers over the generated client, and integration tests that validate real PostgreSQL behavior through migration, seed, CRUD, unique constraints, and soft delete flows. Limit repository coverage to the core entities needed to prove the schema shape is sound while still defining all M1 entities in the schema.

**Tech Stack:** Prisma, PostgreSQL, TypeScript, Vitest, pnpm workspace, Docker Compose

---

### Task 1: Add Prisma tooling and M1 database test harness

**Files:**

- Modify: `package.json`
- Modify: `packages/database/package.json`
- Modify: `packages/database/tsconfig.json`
- Create: `packages/database/prisma.config.ts`
- Create: `packages/database/vitest.config.ts`
- Create: `tests/integration/database/schema.contract.test.ts`
- Create: `tests/integration/database/repositories.integration.test.ts`

- [ ] **Step 1: Write the failing database contract tests**

Implementation notes:

- `schema.contract.test.ts` asserts the Prisma schema declares required core models and the repository package exports a client factory.
- `repositories.integration.test.ts` exercises one happy-path CRUD cycle and one unique-constraint case through the future repository API.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/integration/database/schema.contract.test.ts tests/integration/database/repositories.integration.test.ts`
Expected: FAIL because Prisma config, generated client, and repository exports do not exist yet.

- [ ] **Step 3: Add Prisma dependencies, scripts, and test harness config**

Implementation notes:

- Root adds `prisma` and package-level adds `@prisma/client`.
- Root scripts include `db:generate`, `db:migrate`, `db:seed`, and `db:reset:test`.
- `packages/database/prisma.config.ts` points Prisma at `packages/database/prisma/schema.prisma`.
- Test harness reads `DATABASE_URL` from the environment and expects local PostgreSQL.

- [ ] **Step 4: Re-run tests to keep them red for the expected missing schema/repository reasons**

Run: `pnpm vitest run tests/integration/database/schema.contract.test.ts tests/integration/database/repositories.integration.test.ts`
Expected: FAIL with missing schema/client/repository details, not tooling bootstrap errors.

### Task 2: Define Prisma schema, migration, and seed data

**Files:**

- Create: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/seed.ts`
- Create: `packages/database/prisma/migrations/<timestamp>_init/migration.sql`
- Create: `packages/database/src/client.ts`
- Create: `packages/database/src/index.ts`
- Create: `packages/database/src/schema-metadata.ts`

- [ ] **Step 1: Implement the full M1 Prisma schema**

Implementation notes:

- Include every M1 model from `spec/03` and `spec/06`.
- All core tables include `id`, `userId`, `createdAt`, `updatedAt`, optional `deletedAt`, and optional `metadata`.
- Add practical enums for platform, provider mode, account status, content type, publish status, interaction status, lead level, lead status, research status, media review status, and run log status.
- Add key foreign keys and uniqueness:
  - `PlatformAccount(userId, platform, name)` unique
  - `ContentVariant(contentItemId, platform, contentType)` unique
  - `PublishJob(contentVariantId, platformAccountId, mode)` unique
  - `Interaction(platformAccountId, externalInteractionId)` unique
  - `Lead(sourcePlatform, sourceAccountId, externalUserId)` unique

- [ ] **Step 2: Generate the initial migration**

Run: `pnpm db:migrate --name init`
Expected: PASS and create the initial Prisma migration under `packages/database/prisma/migrations/`.

- [ ] **Step 3: Implement seed data**

Implementation notes:

- Seed one demo user.
- Seed six platform accounts covering all required platforms in `mock` mode.
- Seed one content project, one content item, six content variants, one publish job, one interaction, one lead, and one research task.

- [ ] **Step 4: Run seed**

Run: `pnpm db:seed`
Expected: PASS and populate demo records.

### Task 3: Implement repository layer and database integration tests

**Files:**

- Create: `packages/database/src/repositories/base-repository.ts`
- Create: `packages/database/src/repositories/user-repository.ts`
- Create: `packages/database/src/repositories/platform-account-repository.ts`
- Create: `packages/database/src/repositories/content-project-repository.ts`
- Create: `packages/database/src/repositories/content-item-repository.ts`
- Create: `packages/database/src/repositories/content-variant-repository.ts`
- Create: `packages/database/src/repositories/publish-job-repository.ts`
- Create: `packages/database/src/repositories/interaction-repository.ts`
- Create: `packages/database/src/repositories/lead-repository.ts`
- Create: `packages/database/src/repositories/research-task-repository.ts`
- Create: `packages/database/src/repositories/index.ts`
- Modify: `tests/integration/database/repositories.integration.test.ts`

- [ ] **Step 1: Implement minimal repository APIs for core entities**

Implementation notes:

- Each repository supports `create`, `getById`, `listActiveByUser`, `update`, and `softDelete` where meaningful.
- `softDelete` sets `deletedAt` and active list methods exclude soft-deleted rows.
- Keep repositories thin over Prisma rather than inventing an abstraction tower.

- [ ] **Step 2: Extend integration tests**

Implementation notes:

- Verify CRUD for `User`, `PlatformAccount`, `ContentProject`, `PublishJob`, `Interaction`, `Lead`, and `ResearchTask`.
- Verify one uniqueness failure for `Interaction(platformAccountId, externalInteractionId)`.
- Verify soft delete hides rows from active lists.
- Verify seeded six platform accounts exist.

- [ ] **Step 3: Run integration tests**

Run: `pnpm vitest run tests/integration/database/schema.contract.test.ts tests/integration/database/repositories.integration.test.ts`
Expected: PASS

### Task 4: Verify the full M1 database foundation

**Files:**

- Verify all files created above

- [ ] **Step 1: Generate Prisma client**

Run: `pnpm db:generate`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: PASS with unit and integration suites green.

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: PASS with database package compiling cleanly.

- [ ] **Step 5: Re-run migration and seed commands**

Run: `pnpm db:migrate`
Expected: PASS with no pending changes.

Run: `pnpm db:seed`
Expected: PASS
