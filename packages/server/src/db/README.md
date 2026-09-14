# Main DB (MikroORM)

Single ORM for the whole server (business + admin). **Do not** import
`@colyseus/database`, `@colyseus/admin`, or `drizzle-orm` anywhere in
`packages/server/src/` — those were the v1 admin stack and have been
removed (see [ADR-0006](../../../../docs/adr/0006-admin-v2-refine-mikroorm.md)
D44/D47 and [`docs/admin-integration.md`](../../../../docs/admin-integration.md) v2).

Admin tables live in the same PostgreSQL database under the `admin` schema
(registered through the same `MikroORM` instance); see `entities/admin/`.

Current business entities: `Player` / `AuthIdentity` / `Plot` / `OperationReceipt`.
Migrations are hand-written SQL in `./sql/` and applied by `./migrator.ts`
(`umzug → emittery@0.13` is broken on pnpm, so the migrator runs SQL
directly — see comment at the top of `migrator.ts`).