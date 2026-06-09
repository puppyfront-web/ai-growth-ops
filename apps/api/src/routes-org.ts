import type { ServerResponse, IncomingMessage } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { DatabaseClient } from '@ai-growth-ops/database';
import { getAuthenticatedUser, getOrganizationContext } from './auth.js';
import { getEmailProvider, inviteMemberEmail } from '@ai-growth-ops/email';
import { hasPermission } from './middleware/rbac.js';

interface OrgRouteContext {
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

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, '-')
      .replace(/^-|-$/g, '') || `org-${randomBytes(4).toString('hex')}`
  );
}

export const orgRoutes: Array<{
  method: string;
  pattern: string;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    ctx: OrgRouteContext
  ) => Promise<void>;
}> = [
  // ── GET /api/org — List user's organizations ─────────────────────────────
  {
    method: 'GET',
    pattern: '/api/org',
    handler: async (req, res, ctx) => {
      const user = await getAuthenticatedUser(req, ctx.db);
      if (!user) return sendJson(res, 401, { error: '未登录' });

      const memberships = await ctx.db.organizationMember.findMany({
        where: { userId: user.id, status: 'active' },
        include: { organization: true },
        orderBy: { joinedAt: 'asc' }
      });

      const orgs = memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
        isDefault:
          (m.organization.metadata as Record<string, unknown>)?.isDefault ===
          true
      }));

      sendJson(res, 200, { organizations: orgs });
    }
  },

  // ── POST /api/org — Create organization ──────────────────────────────────
  {
    method: 'POST',
    pattern: '/api/org',
    handler: async (req, res, ctx) => {
      const user = await getAuthenticatedUser(req, ctx.db);
      if (!user) return sendJson(res, 401, { error: '未登录' });

      const body = ctx.body as Record<string, unknown>;
      const name = String(body.name || '').trim();
      if (!name) return sendJson(res, 400, { error: '请输入组织名称' });

      const slug = `${slugify(name)}-${randomBytes(4).toString('hex')}`;

      // Check slug uniqueness
      const existing = await ctx.db.organization.findUnique({
        where: { slug }
      });
      if (existing) return sendJson(res, 409, { error: '组织标识已存在' });

      const org = await ctx.db.organization.create({
        data: {
          name,
          slug,
          status: 'active',
          metadata: {}
        }
      });

      // Creator becomes owner
      await ctx.db.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: 'owner',
          status: 'active'
        }
      });

      sendJson(res, 201, {
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: 'owner'
      });
    }
  },

  // ── GET /api/org/:orgId — Get organization detail ────────────────────────
  {
    method: 'GET',
    pattern: '/api/org/:orgId',
    handler: async (req, res, ctx) => {
      const user = await getAuthenticatedUser(req, ctx.db);
      if (!user) return sendJson(res, 401, { error: '未登录' });

      const membership = await ctx.db.organizationMember.findFirst({
        where: {
          organizationId: ctx.params.orgId,
          userId: user.id,
          status: 'active'
        },
        include: { organization: true }
      });
      if (!membership)
        return sendJson(res, 404, { error: '组织不存在或无权访问' });

      const memberCount = await ctx.db.organizationMember.count({
        where: { organizationId: ctx.params.orgId, status: 'active' }
      });

      sendJson(res, 200, {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        description: membership.organization.description,
        avatarUrl: membership.organization.avatarUrl,
        role: membership.role,
        memberCount,
        createdAt: membership.organization.createdAt
      });
    }
  },

  // ── PATCH /api/org/:orgId — Update organization ──────────────────────────
  {
    method: 'PATCH',
    pattern: '/api/org/:orgId',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (orgCtx.organization.id !== ctx.params.orgId)
        return sendJson(res, 403, { error: '无权操作' });
      if (orgCtx.memberRole !== 'owner' && orgCtx.memberRole !== 'admin') {
        return sendJson(res, 403, { error: '需要管理员权限' });
      }

      const body = ctx.body as Record<string, unknown>;
      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data.name = String(body.name).trim();
      if (body.description !== undefined)
        data.description = String(body.description).trim() || null;
      if (body.avatarUrl !== undefined)
        data.avatarUrl = String(body.avatarUrl).trim() || null;

      if (!data.name && data.name !== undefined)
        return sendJson(res, 400, { error: '组织名称不能为空' });

      const org = await ctx.db.organization.update({
        where: { id: ctx.params.orgId },
        data
      });

      sendJson(res, 200, {
        id: org.id,
        name: org.name,
        slug: org.slug,
        description: org.description,
        avatarUrl: org.avatarUrl
      });
    }
  },

  // ── GET /api/org/:orgId/members — List members ───────────────────────────
  {
    method: 'GET',
    pattern: '/api/org/:orgId/members',
    handler: async (req, res, ctx) => {
      const user = await getAuthenticatedUser(req, ctx.db);
      if (!user) return sendJson(res, 401, { error: '未登录' });

      // Verify membership
      const membership = await ctx.db.organizationMember.findFirst({
        where: {
          organizationId: ctx.params.orgId,
          userId: user.id,
          status: 'active'
        }
      });
      if (!membership) return sendJson(res, 403, { error: '无权查看' });

      const members = await ctx.db.organizationMember.findMany({
        where: { organizationId: ctx.params.orgId, status: 'active' },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true }
          }
        },
        orderBy: { joinedAt: 'asc' }
      });

      sendJson(res, 200, {
        members: members.map((m) => ({
          id: m.id,
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          avatarUrl: m.user.avatarUrl,
          role: m.role,
          joinedAt: m.joinedAt
        }))
      });
    }
  },

  // ── POST /api/org/:orgId/invite — Invite member ──────────────────────────
  {
    method: 'POST',
    pattern: '/api/org/:orgId/invite',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (orgCtx.organization.id !== ctx.params.orgId)
        return sendJson(res, 403, { error: '无权操作' });
      if (!hasPermission(orgCtx.memberRole, 'team:manage')) {
        return sendJson(res, 403, { error: '权限不足' });
      }

      const body = ctx.body as Record<string, unknown>;
      const email = String(body.email || '')
        .trim()
        .toLowerCase();
      const role = String(body.role || 'member');

      if (!email || !email.includes('@'))
        return sendJson(res, 400, { error: '请输入有效的邮箱地址' });
      if (!['member', 'admin', 'viewer'].includes(role))
        return sendJson(res, 400, { error: '无效的角色' });

      // Check if already a member
      const existingUser = await ctx.db.user.findUnique({ where: { email } });
      if (existingUser) {
        const existingMember = await ctx.db.organizationMember.findFirst({
          where: { organizationId: ctx.params.orgId, userId: existingUser.id }
        });
        if (existingMember)
          return sendJson(res, 409, { error: '该用户已是组织成员' });
      }

      // Create invitation
      const token = randomBytes(32).toString('hex');
      const invitation = await ctx.db.organizationInvitation.create({
        data: {
          organizationId: ctx.params.orgId,
          invitedByUserId: orgCtx.user.id,
          inviteeEmail: email,
          role,
          token,
          status: 'pending',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      });

      // TODO: Send invitation email (Week 4)
      console.log(`[ORG] Invitation token for ${email}: ${token}`);

      // Send invitation email (non-blocking)
      const baseUrl = process.env.APP_URL || 'http://localhost:3000';
      const acceptUrl = `${baseUrl}/accept-invite?token=${token}&orgId=${ctx.params.orgId}`;
      const emailProvider = getEmailProvider();
      const emailContent = inviteMemberEmail({
        inviterName: orgCtx.user.name,
        orgName: orgCtx.organization.name,
        acceptUrl
      });
      emailProvider
        .send({
          to: email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text
        })
        .catch((err) => {
          console.error(`[ORG] Failed to send invite email to ${email}:`, err);
        });

      sendJson(res, 201, {
        id: invitation.id,
        email: invitation.inviteeEmail,
        role: invitation.role,
        expiresAt: invitation.expiresAt
      });
    }
  },

  // ── POST /api/org/:orgId/accept-invite — Accept invitation ───────────────
  {
    method: 'POST',
    pattern: '/api/org/:orgId/accept-invite',
    handler: async (req, res, ctx) => {
      const user = await getAuthenticatedUser(req, ctx.db);
      if (!user) return sendJson(res, 401, { error: '未登录' });

      const body = ctx.body as Record<string, unknown>;
      const token = String(body.token || '');
      if (!token) return sendJson(res, 400, { error: '缺少邀请令牌' });

      const invitation = await ctx.db.organizationInvitation.findUnique({
        where: { token }
      });
      if (!invitation) return sendJson(res, 400, { error: '邀请令牌无效' });
      if (invitation.organizationId !== ctx.params.orgId)
        return sendJson(res, 400, { error: '邀请与组织不匹配' });
      if (invitation.status !== 'pending')
        return sendJson(res, 400, { error: '邀请已处理' });
      if (invitation.expiresAt < new Date())
        return sendJson(res, 400, { error: '邀请已过期' });
      if (invitation.inviteeEmail.toLowerCase() !== user.email.toLowerCase()) {
        return sendJson(res, 403, { error: '此邀请不是发送给您的' });
      }

      // Accept in transaction
      await ctx.db.$transaction([
        ctx.db.organizationInvitation.update({
          where: { id: invitation.id },
          data: { status: 'accepted', acceptedAt: new Date() }
        }),
        ctx.db.organizationMember.create({
          data: {
            organizationId: invitation.organizationId,
            userId: user.id,
            role: invitation.role,
            status: 'active'
          }
        })
      ]);

      sendJson(res, 200, { success: true, message: '已加入组织' });
    }
  },

  // ── DELETE /api/org/:orgId/members/:memberId — Remove member ─────────────
  {
    method: 'DELETE',
    pattern: '/api/org/:orgId/members/:memberId',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (orgCtx.organization.id !== ctx.params.orgId)
        return sendJson(res, 403, { error: '无权操作' });
      if (!hasPermission(orgCtx.memberRole, 'team:manage')) {
        return sendJson(res, 403, { error: '权限不足' });
      }

      const member = await ctx.db.organizationMember.findUnique({
        where: { id: ctx.params.memberId }
      });
      if (!member || member.organizationId !== ctx.params.orgId) {
        return sendJson(res, 404, { error: '成员不存在' });
      }
      if (member.role === 'owner')
        return sendJson(res, 400, { error: '不能移除组织所有者' });

      await ctx.db.organizationMember.delete({
        where: { id: ctx.params.memberId }
      });

      sendJson(res, 200, { success: true });
    }
  },

  // ── PATCH /api/org/:orgId/members/:memberId/role — Change role ───────────
  {
    method: 'PATCH',
    pattern: '/api/org/:orgId/members/:memberId/role',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (orgCtx.organization.id !== ctx.params.orgId)
        return sendJson(res, 403, { error: '无权操作' });
      if (!hasPermission(orgCtx.memberRole, 'team:manage')) {
        return sendJson(res, 403, { error: '权限不足' });
      }

      const body = ctx.body as Record<string, unknown>;
      const role = String(body.role || '');
      if (!['admin', 'member', 'viewer'].includes(role))
        return sendJson(res, 400, { error: '无效角色' });

      const member = await ctx.db.organizationMember.findUnique({
        where: { id: ctx.params.memberId }
      });
      if (!member || member.organizationId !== ctx.params.orgId) {
        return sendJson(res, 404, { error: '成员不存在' });
      }
      if (member.role === 'owner')
        return sendJson(res, 400, { error: '不能变更所有者角色' });

      await ctx.db.organizationMember.update({
        where: { id: ctx.params.memberId },
        data: { role }
      });

      sendJson(res, 200, { success: true });
    }
  },

  // ── GET /api/org/current — Get current org context ───────────────────────
  {
    method: 'GET',
    pattern: '/api/org/current',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });

      sendJson(res, 200, {
        id: orgCtx.organization.id,
        name: orgCtx.organization.name,
        slug: orgCtx.organization.slug,
        role: orgCtx.memberRole
      });
    }
  }
];
