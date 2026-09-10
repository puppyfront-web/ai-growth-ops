import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseClient } from '@ai-growth-ops/database';
import { normalizePhone } from '@ai-growth-ops/shared';
import { getOrganizationContext } from './auth.js';
import { parsePagination, paginate } from './middleware/pagination.js';
import { validateBody } from './middleware/validate.js';
import { hasPermission, type Permission } from './middleware/rbac.js';
import {
  addCustomerActivitySchema,
  createCustomerSchema,
  customerImportExecuteSchema,
  customerImportPreviewSchema,
  icpConfigSchema,
  updateCustomerSchema,
  updateCustomerPlaybookSchema
} from './schemas/customers.js';
import {
  executeCustomerImport,
  previewCustomerImport
} from './services/customer-import.js';
import {
  enqueueCustomerProfileRefresh,
  loadIcpConfig,
  refreshCustomerProfile,
  saveIcpConfig
} from './services/customer-profile.js';
import {
  approveCustomerPlaybook,
  enqueueCustomerPlaybookGenerate,
  generateCustomerPlaybook,
  getLatestCustomerPlaybook,
  listCustomerFollowUps,
  updateCustomerPlaybook
} from './services/customer-playbook.js';

interface CustomerRouteContext {
  db: DatabaseClient;
  url: URL;
  params: Record<string, string>;
  body: unknown;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function canAccess(
  res: ServerResponse,
  role: string,
  permission: Permission
): boolean {
  if (hasPermission(role, permission)) return true;
  sendJson(res, 403, { error: '权限不足' });
  return false;
}

async function findDuplicates(
  db: DatabaseClient,
  organizationId: string,
  phone: string,
  excludeId?: string
) {
  const normalized = normalizePhone(phone);
  return db.customer.findMany({
    where: {
      organizationId,
      phone: normalized,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: {
      id: true,
      displayName: true,
      phone: true,
      company: true,
      role: true,
      intent: true,
      channel: true,
      status: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  });
}

export const customerRoutes: Array<{
  method: string;
  pattern: string;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    ctx: CustomerRouteContext
  ) => Promise<void>;
}> = [
  {
    method: 'GET',
    pattern: '/api/customers/follow-ups',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;
      const items = await listCustomerFollowUps(ctx.db, orgCtx.organization.id);
      sendJson(res, 200, { items });
    }
  },
  {
    method: 'GET',
    pattern: '/api/customers/check-duplicate',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;

      const phone = ctx.url.searchParams.get('phone')?.trim();
      if (!phone) return sendJson(res, 400, { error: '请提供手机号' });

      const duplicates = await findDuplicates(
        ctx.db,
        orgCtx.organization.id,
        phone
      );
      sendJson(res, 200, {
        duplicates,
        normalizedPhone: normalizePhone(phone)
      });
    }
  },
  {
    method: 'GET',
    pattern: '/api/customers',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;

      const { page, pageSize } = parsePagination(ctx.url);
      const where: Record<string, unknown> = {
        organizationId: orgCtx.organization.id,
        deletedAt: null
      };

      const status = ctx.url.searchParams.get('status');
      if (status) where.status = status;

      const channel = ctx.url.searchParams.get('channel');
      if (channel) where.channel = channel;

      const source = ctx.url.searchParams.get('source');
      if (source === 'prospecting') {
        where.metadata = {
          path: ['prospectingTaskId'],
          string_starts_with: ''
        };
      }

      const q = ctx.url.searchParams.get('q')?.trim();
      if (q) {
        where.OR = [
          { displayName: { contains: q, mode: 'insensitive' } },
          { company: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          { intent: { contains: q, mode: 'insensitive' } }
        ];
      }

      const result = await paginate(
        ctx.db.customer,
        where,
        { page, pageSize },
        { createdAt: 'desc' },
        {
          activities: { orderBy: { createdAt: 'desc' }, take: 3 }
        }
      );
      sendJson(res, 200, result);
    }
  },
  {
    method: 'POST',
    pattern: '/api/customers',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;

      const bodyResult = validateBody(createCustomerSchema, ctx.body);
      if (!bodyResult.success) {
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      }

      const body = bodyResult.data;
      const normalizedPhone = normalizePhone(body.phone);
      const result = await ctx.db.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtext(${`${orgCtx.organization.id}:${normalizedPhone}`})
          )
        `;
        const duplicates = await tx.customer.findMany({
          where: {
            organizationId: orgCtx.organization.id,
            phone: normalizedPhone,
            deletedAt: null
          },
          select: {
            id: true,
            displayName: true,
            phone: true,
            company: true,
            role: true,
            intent: true,
            channel: true,
            status: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' }
        });

        if (duplicates.length > 0 && !body.confirmDuplicate) {
          return { duplicates, customer: null };
        }

        const customer = await tx.customer.create({
          data: {
            organizationId: orgCtx.organization.id,
            userId: orgCtx.user.id,
            displayName: body.displayName.trim(),
            phone: normalizedPhone,
            company: body.company.trim(),
            role: body.role.trim(),
            intent: body.intent.trim(),
            channel: body.channel,
            sourceNote: body.sourceNote?.trim() || undefined,
            assignedTo: body.assignedTo?.trim() || undefined,
            tags: body.tags ?? undefined,
            activities: {
              create: {
                action: 'created',
                note:
                  duplicates.length > 0
                    ? '用户确认后新建（存在重复手机号）'
                    : '手动录入',
                operator: orgCtx.user.name
              }
            }
          },
          include: {
            activities: { orderBy: { createdAt: 'desc' } }
          }
        });
        return { duplicates, customer };
      });

      if (!result.customer) {
        return sendJson(res, 409, {
          error: 'duplicate',
          message: '已存在相同手机号的客户，请确认是否仍要新建',
          duplicates: result.duplicates,
          normalizedPhone
        });
      }

      sendJson(res, 201, result.customer);
      enqueueCustomerProfileRefresh(
        result.customer.id,
        orgCtx.organization.id,
        orgCtx.user.id
      ).catch(() => undefined);
    }
  },
  {
    method: 'GET',
    pattern: '/api/customers/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;

      const customer = await ctx.db.customer.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        },
        include: {
          activities: { orderBy: { createdAt: 'desc' } },
          profile: true,
          leads: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      if (!customer) return sendJson(res, 404, { error: '客户不存在' });
      sendJson(res, 200, customer);
    }
  },
  {
    method: 'PUT',
    pattern: '/api/customers/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;

      const bodyResult = validateBody(updateCustomerSchema, ctx.body);
      if (!bodyResult.success) {
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      }

      const existing = await ctx.db.customer.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!existing) return sendJson(res, 404, { error: '客户不存在' });

      const body = bodyResult.data;
      let phoneUpdate: string | undefined;
      if (body.phone !== undefined) {
        phoneUpdate = body.phone.trim() ? normalizePhone(body.phone) : '';
        if (phoneUpdate) {
          const duplicates = await findDuplicates(
            ctx.db,
            orgCtx.organization.id,
            phoneUpdate,
            existing.id
          );
          if (duplicates.length > 0) {
            return sendJson(res, 409, {
              error: 'duplicate',
              message: '该手机号已被其他客户使用',
              duplicates,
              normalizedPhone: phoneUpdate
            });
          }
        }
      }

      const existingTags = Array.isArray(existing.tags)
        ? existing.tags.filter((item): item is string => typeof item === 'string')
        : [];
      const nextTags = body.tags ?? existingTags;
      const tags =
        phoneUpdate === undefined
          ? nextTags
          : phoneUpdate
            ? nextTags.filter((tag) => tag !== '待跟进')
            : nextTags.includes('待跟进')
              ? nextTags
              : [...nextTags, '待跟进'];

      const customer = await ctx.db.customer.update({
        where: { id: existing.id },
        data: {
          ...(body.displayName != null && {
            displayName: body.displayName.trim()
          }),
          ...(phoneUpdate !== undefined && { phone: phoneUpdate }),
          ...(body.company != null && {
            company: body.company.trim() || '待补充'
          }),
          ...(body.role != null && { role: body.role.trim() || '待补充' }),
          ...(body.intent != null && { intent: body.intent.trim() }),
          ...(body.channel != null && { channel: body.channel }),
          ...(body.sourceNote !== undefined && {
            sourceNote: body.sourceNote?.trim() || null
          }),
          ...(body.status != null && { status: body.status }),
          ...(body.assignedTo !== undefined && {
            assignedTo: body.assignedTo?.trim() || null
          }),
          ...((phoneUpdate !== undefined || body.tags !== undefined) && { tags })
        },
        include: {
          activities: { orderBy: { createdAt: 'desc' } }
        }
      });

      sendJson(res, 200, customer);
    }
  },
  {
    method: 'POST',
    pattern: '/api/customers/:id/activities',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;

      const bodyResult = validateBody(addCustomerActivitySchema, ctx.body);
      if (!bodyResult.success) {
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      }

      const customer = await ctx.db.customer.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!customer) return sendJson(res, 404, { error: '客户不存在' });

      const activity = await ctx.db.customerActivity.create({
        data: {
          customerId: customer.id,
          action: bodyResult.data.action,
          note: bodyResult.data.note,
          operator: orgCtx.user.name
        }
      });

      sendJson(res, 201, activity);
      enqueueCustomerProfileRefresh(
        customer.id,
        orgCtx.organization.id,
        orgCtx.user.id
      ).catch(() => undefined);
    }
  },
  {
    method: 'GET',
    pattern: '/api/customers/:id/profile',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;

      const customer = await ctx.db.customer.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        },
        include: { profile: true }
      });
      if (!customer) return sendJson(res, 404, { error: '客户不存在' });

      sendJson(res, 200, {
        customerId: customer.id,
        fitScore: customer.fitScore,
        intentScore: customer.intentScore,
        healthScore: customer.healthScore,
        segment: customer.segment,
        profile: customer.profile
      });
    }
  },
  {
    method: 'POST',
    pattern: '/api/customers/:id/profile/refresh',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;

      try {
        const result = await refreshCustomerProfile(
          ctx.db,
          ctx.params.id,
          orgCtx.organization.id,
          orgCtx.user.id
        );
        enqueueCustomerPlaybookGenerate(
          ctx.params.id,
          orgCtx.organization.id
        ).catch(() => undefined);
        sendJson(res, 200, result);
      } catch (e) {
        sendJson(res, 400, { error: (e as Error).message });
      }
    }
  },
  {
    method: 'GET',
    pattern: '/api/customers/:id/playbook',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;

      try {
        const playbook = await getLatestCustomerPlaybook(
          ctx.db,
          ctx.params.id,
          orgCtx.organization.id
        );
        sendJson(res, 200, { playbook });
      } catch (e) {
        sendJson(res, 400, { error: (e as Error).message });
      }
    }
  },
  {
    method: 'POST',
    pattern: '/api/customers/:id/playbook/generate',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;

      try {
        const result = await generateCustomerPlaybook(
          ctx.db,
          ctx.params.id,
          orgCtx.organization.id
        );
        sendJson(res, 200, result);
      } catch (e) {
        sendJson(res, 400, { error: (e as Error).message });
      }
    }
  },
  {
    method: 'POST',
    pattern: '/api/customers/:id/playbook/:playbookId/approve',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;

      try {
        const playbook = await approveCustomerPlaybook(
          ctx.db,
          ctx.params.id,
          ctx.params.playbookId,
          orgCtx.organization.id,
          orgCtx.user.name
        );
        sendJson(res, 200, { playbook });
      } catch (e) {
        sendJson(res, 400, { error: (e as Error).message });
      }
    }
  },
  {
    method: 'PUT',
    pattern: '/api/customers/:id/playbook/:playbookId',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;

      const bodyResult = validateBody(updateCustomerPlaybookSchema, ctx.body);
      if (!bodyResult.success) {
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      }

      try {
        const playbook = await updateCustomerPlaybook(
          ctx.db,
          ctx.params.id,
          ctx.params.playbookId,
          orgCtx.organization.id,
          bodyResult.data,
          orgCtx.user.name
        );
        sendJson(res, 200, { playbook });
      } catch (e) {
        sendJson(res, 400, { error: (e as Error).message });
      }
    }
  },
  {
    method: 'GET',
    pattern: '/api/settings/icp',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'settings:manage')) return;
      sendJson(res, 200, await loadIcpConfig(ctx.db, orgCtx.organization.id));
    }
  },
  {
    method: 'PUT',
    pattern: '/api/settings/icp',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'settings:manage')) return;
      const bodyResult = validateBody(icpConfigSchema, ctx.body);
      if (!bodyResult.success) {
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      }
      const config = bodyResult.data;
      await saveIcpConfig(
        ctx.db,
        orgCtx.user.id,
        orgCtx.organization.id,
        config
      );
      sendJson(res, 200, config);
    }
  },
  {
    method: 'POST',
    pattern: '/api/customers/import/preview',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;

      const bodyResult = validateBody(customerImportPreviewSchema, ctx.body);
      if (!bodyResult.success) {
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      }

      try {
        const result = await previewCustomerImport(
          ctx.db,
          orgCtx.organization.id,
          bodyResult.data.csv,
          bodyResult.data.mapping
        );
        sendJson(res, 200, result);
      } catch (e) {
        sendJson(res, 400, { error: (e as Error).message });
      }
    }
  },
  {
    method: 'POST',
    pattern: '/api/customers/import',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;

      const bodyResult = validateBody(customerImportExecuteSchema, ctx.body);
      if (!bodyResult.success) {
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      }

      try {
        const result = await executeCustomerImport(ctx.db, {
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id,
          operatorName: orgCtx.user.name,
          csv: bodyResult.data.csv,
          mapping: bodyResult.data.mapping,
          skipDuplicates: bodyResult.data.skipDuplicates
        });
        for (const customerId of result.createdCustomerIds) {
          enqueueCustomerProfileRefresh(
            customerId,
            orgCtx.organization.id,
            orgCtx.user.id
          ).catch(() => undefined);
        }
        sendJson(res, 201, result);
      } catch (e) {
        sendJson(res, 400, { error: (e as Error).message });
      }
    }
  }
];
