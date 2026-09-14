/**
 * Admin sub-module boundary.
 *
 * v2 路径（2026-09-14 决策）：放弃 `@colyseus/admin` + `@colyseus/database` + Drizzle + 第二个 DB，
 * 改用 Refine standalone + 我们自己的 Fastify `/admin-ops/*` 路由 + MikroORM `admin` schema。
 * 单 DB 单 ORM，admin 数据与业务数据在同一事务可原子。
 *
 * 详见 [`docs/admin-integration.md`](../../../../docs/admin-integration.md) v2。
 *
 * 旧的"双 ORM 物理隔离"五条规则**作废**。新边界规则：
 *   - 业务代码（`auth|crop|player|farm|realtime/**`）禁止 import `drizzle-orm` /
 *     `@colyseus/database` / `@colyseus/admin`（计划从 `package.json` 移除）
 *   - Admin 代码（`packages/server/src/admin/**`）允许 import `@mikro-orm/core`
 *     （admin 也用同一份 MikroORM，只是 entities 放 `admin` schema）
 *
 * Phase 1 状态：当前 `mountAdmin()` 在 `ENABLE_ADMIN=0` 时挂 `/admin/healthz` 返 `{enabled:false}`；
 * `ENABLE_ADMIN=1` 时抛 `AdminConfigError`（admin 子模块 v2 待实装，见 admin-integration.md §4 迁移顺序）。
 */

import type { FastifyInstance } from 'fastify';

export interface AdminDeps {
  adminDbUrl: string;
  jwtSecretAdmin: string;
  sessionSecret: string;
}

export class AdminConfigError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'AdminConfigError';
  }
}

/**
 * Mount admin ops on `app` at `/admin-ops/*` and `/admin/healthz`.
 *
 * v1 计划：挂 `@colyseus/admin` + Drizzle + 第二个 DB。已废弃（2026-09-14）。
 * v2 计划：挂 `/admin-ops/*` 路由（`authenticateAdmin` 装饰器 + MikroORM）。
 *
 * 当前阶段（`ENABLE_ADMIN=0`）：挂 `/admin/healthz` 返 `{enabled:false}`，admin 子模块不初始化。
 * `ENABLE_ADMIN=1`：抛 `AdminConfigError`（admin 子模块 v2 待实装）。
 */
export async function mountAdmin(app: FastifyInstance, deps: AdminDeps, enableAdmin: boolean): Promise<void> {
  // Reference `deps` to keep the parameter list stable for callers/tests even
  // though the current implementation does not use them.
  void deps;

  if (!enableAdmin) {
    app.get('/admin/healthz', async () => ({ ok: true, enabled: false }));
    app.get('/admin', async (_req, reply) => reply.code(404).send({ ok: false }));
    return;
  }

  throw new AdminConfigError(
    'ENABLE_ADMIN=1 but admin sub-module is v2 (planned). ' +
    'See docs/admin-integration.md v2 §4 for migration order.',
  );
}