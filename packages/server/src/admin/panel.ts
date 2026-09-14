/**
 * Admin panel placeholder — v2 路径。
 *
 * v1 计划：包裹 `@colyseus/admin` 的 `admin({})` 工厂 + Drizzle pool。已废弃（2026-09-14）。
 * v2 计划：前端用独立 npm 包（`refine` + `@refinedev/*` + shadcn + tailwindcss），
 * 走独立 web 包（`packages/admin-web/` 或 `packages/client-app/admin/` 子项目），
 * dataProvider 指向我们自己的 Fastify `/admin-ops/*` 路由。
 *
 * 本文件保留是为了显式标记"admin 前端不再挂在 server 进程内"这条边界。
 * 详见 [`docs/admin-integration.md`](../../../../docs/admin-integration.md) v2 §2 架构图。
 */

import { AdminConfigError } from './index.js';

export async function bootstrapAdminPanel(_options: { enableAdmin: boolean }): Promise<never> {
  throw new AdminConfigError(
    'bootstrapAdminPanel is removed in v2 — admin frontend is a separate web package, ' +
    'not a server-side panel mount. See docs/admin-integration.md v2 §2.',
  );
}