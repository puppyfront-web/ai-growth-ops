import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseClient } from '@ai-growth-ops/database';
import type { z } from 'zod';
import { getOrganizationContext } from './auth.js';
import { hasPermission, type Permission } from './middleware/rbac.js';
import { validateBody, validateQuery } from './middleware/validate.js';

/**
 * 路由工具箱（45 号 spec）：Route/RouteContext/sendJson/canAccess 的唯一来源，
 * 结束 16 份拷贝与逐路由手写样板。新路由一律用 defineRoute 声明；
 * 既有 routes-*.ts 至少改为从这里导入公共设施。
 */

export interface RouteContext {
  db: DatabaseClient;
  url: URL;
  params: Record<string, string>;
  body: unknown;
}

export interface Route {
  method: string;
  pattern: string;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    ctx: RouteContext
  ) => Promise<void>;
}

export function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown
) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

/** 权限不足时写 403 并返回 false；等价于旧各文件本地 canAccess。 */
export function canAccess(
  res: ServerResponse,
  role: string,
  permission: Permission
): boolean {
  if (hasPermission(role, permission)) return true;
  sendJson(res, 403, { error: '权限不足' });
  return false;
}

/** 服务层可抛出的业务错误：由 defineRoute 统一映射为响应。 */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

type AuthedRouteContext = RouteContext & {
  org: NonNullable<Awaited<ReturnType<typeof getOrganizationContext>>>;
};

type RouteDefinition<TBody extends z.ZodTypeAny | undefined> = {
  method: string;
  pattern: string;
  /** 省略表示仅要求登录（与既有 401 行为一致） */
  permission?: Permission;
  bodySchema?: TBody;
  querySchema?: z.ZodTypeAny;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    ctx: AuthedRouteContext & {
      body: TBody extends z.ZodTypeAny ? z.infer<TBody> : undefined;
    }
  ) => Promise<void>;
};

/**
 * 组合鉴权/权限/校验的路由工厂。错误响应形状与既有手写路由一致：
 * 401 { error: '未登录' } / 403 { error: '权限不足' } /
 * 400 { error: '输入验证失败', errors } / AppError → { error, code } /
 * 其余异常 → 500 { error: message }。
 */
export function defineRoute<
  TBody extends z.ZodTypeAny | undefined = undefined
>(definition: RouteDefinition<TBody>): Route {
  return {
    method: definition.method,
    pattern: definition.pattern,
    handler: async (req, res, ctx) => {
      try {
        const org = await getOrganizationContext(req, ctx.db);
        if (!org) return sendJson(res, 401, { error: '未登录' });
        if (
          definition.permission &&
          !hasPermission(org.memberRole, definition.permission)
        ) {
          return sendJson(res, 403, { error: '权限不足' });
        }
        let body: unknown;
        if (definition.bodySchema) {
          const result = validateBody(definition.bodySchema, ctx.body);
          if (!result.success) {
            return sendJson(res, 400, {
              error: '输入验证失败',
              errors: result.errors
            });
          }
          body = result.data;
        }
        if (definition.querySchema) {
          const result = validateQuery(definition.querySchema, ctx.url);
          if (!result.success) {
            return sendJson(res, 400, {
              error: '输入验证失败',
              errors: result.errors
            });
          }
        }
        await definition.handler(
          req,
          res,
          Object.assign(ctx, { org, body }) as never
        );
      } catch (err) {
        if (err instanceof AppError) {
          return sendJson(res, err.status, {
            error: err.message,
            code: err.code
          });
        }
        return sendJson(res, 500, {
          error: err instanceof Error ? err.message : '服务器内部错误'
        });
      }
    }
  };
}
