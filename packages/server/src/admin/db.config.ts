/**
 * Admin DB config placeholder — v2 路径。
 *
 * v1 计划：Drizzle / `@colyseus/database` 连接池，第二个 database。已废弃（2026-09-14）。
 * v2 计划：admin 数据用 MikroORM `admin` schema，与业务共用同一连接 / 同一 EM。
 * 不要再创建第二个数据库、不要装 `@colyseus/database` / `drizzle-orm`。
 *
 * 本文件保留是为了显式标记"不再有第二个 ORM / 第二个 DB"这条边界，方便 reviewer 看到。
 * 详见 [`docs/admin-integration.md`](../../../../docs/admin-integration.md) v2 §1 决策表。
 */

import { AdminConfigError } from './index.js';

export interface DrizzlePoolConfig {
  url: string;
  poolMin: number;
  poolMax: number;
}

/** @deprecated v2 不用 Drizzle pool；保留类型仅为编译期兼容，业务代码不应再调用。 */
export function buildAdminPoolConfig(url: string): DrizzlePoolConfig {
  return { url, poolMin: 2, poolMax: 10 };
}

/** @deprecated v2 走 MikroORM admin schema，不再有独立 admin 连接池。 */
export async function connectAdminDb(_config: DrizzlePoolConfig): Promise<never> {
  throw new AdminConfigError(
    'connectAdminDb is removed in v2 — admin uses MikroORM admin schema, ' +
    'sharing the main ORM connection. See docs/admin-integration.md v2 §5.',
  );
}