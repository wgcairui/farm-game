# Main DB (MikroORM)

This directory hosts the business-side ORM. **Do not** import `@colyseus/database`
or `drizzle-orm` here — those are admin-only and live under `../admin/`.

Phase 1 ships only the config file (`mikro-orm.config.ts`) with an empty
`entities: []` array. Phase 2 will register the first entity (`Player`) and
generate the initial migration.