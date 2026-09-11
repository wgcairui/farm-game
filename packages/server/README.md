# @farm-game/server

Fastify + MikroORM + PostgreSQL backend for the global farm-game API.
Phase 2 G1 (ADR-0003) ships real persistence and atomic domain commands
(`/auth/*`, `/player/*`, `/farm/{unlock,plant,water,harvest}`).

## Quick start

```bash
# 1. Start Postgres (port 127.0.0.1:5432, dev-only credentials)
pnpm db:up

# 2. Apply G1 schema migrations
pnpm db:migrate

# 3. Run the server (picks up MAIN_DB_URL from .env or env vars)
MAIN_DB_URL=postgres://farm:farm@127.0.0.1:5432/farm_game \
JWT_SECRET=dev-secret-change-me \
ENABLE_MOCK_AUTH=1 \
pnpm dev
```

Server logs include `db: postgresql` and the protocol version on boot.

## Tests

| Command                  | Scope                                                 | DB needed |
|--------------------------|-------------------------------------------------------|-----------|
| `pnpm test`              | Unit tests across all packages (65 assertions)        | no        |
| `pnpm test:integration`  | Real-PG HTTP integration suite (6 scenarios)          | yes       |
| `pnpm smoke`             | Handshake + admin boundary (13/16 checks, DB-aware)    | optional  |
| `pnpm demo:loop`         | End-to-end login → unlock → plant → water → harvest   | yes       |

`pnpm smoke` runs without `MAIN_DB_URL` and asserts the in-memory path
returns 503 NOT_IMPLEMENTED for `/farm/*`. When `MAIN_DB_URL` is set,
the same script performs a real `/farm/unlock` against Postgres (16/16
checks). `pnpm test:integration` always requires Postgres and skips
silently if it cannot reach `MAIN_DB_URL`/`TEST_DB_URL`.

## HTTP endpoints (Phase 2 G1)

| Method | Path                  | Auth | Purpose                                                |
|--------|-----------------------|------|--------------------------------------------------------|
| GET    | `/healthz`            | —    | Protocol version echo                                  |
| GET    | `/crop/configs`       | —    | 5-crop catalog from shared `CROPS`                     |
| POST   | `/auth/wechat`        | —    | Mini-program login (mock unless real wechat wired)     |
| POST   | `/auth/oauth`         | —    | iOS/Android OAuth login (mock unless real providers)   |
| POST   | `/auth/bind`          | JWT  | Link another provider identity to the current player   |
| GET    | `/auth/identities/me` | JWT  | Owning client fetches its own provider subjects        |
| GET    | `/auth/_meta`         | —    | Protocol version + server epoch                       |
| GET    | `/player/info`        | JWT  | Full `PlayerSave` (24 plots, identities summary)       |
| POST   | `/farm/unlock`        | JWT  | Unlock a plot (100g)                                  |
| POST   | `/farm/plant`         | JWT  | Plant a crop (deducts `seedPrice`g)                   |
| POST   | `/farm/water`         | JWT  | Water a growing crop (5% remaining-time discount)      |
| POST   | `/farm/harvest`       | JWT  | Harvest a ripe crop (awards `sellPrice`g)             |
| GET    | `/admin/healthz`      | —    | Admin boundary; responds even with `ENABLE_ADMIN=0`   |

All `/farm/*` write commands require an `operationId` envelope:
```json
{ "operationId": "<uuid>", "body": { "plotIndex": 0, "cropId": "carrot" } }
```

Success responses carry `operationId / serverNow / revision / player /
payload`. The DB enforces idempotency on `(playerId, operationId)`;
retries with the same tuple replay the original outcome.

## Environment variables

| Name               | Required     | Default                                |
|--------------------|--------------|----------------------------------------|
| `MAIN_DB_URL`      | yes (G1)     | `null` (server boots in-memory only)   |
| `TEST_DB_URL`      | optional     | falls back to `MAIN_DB_URL`            |
| `HOST`             | optional     | `127.0.0.1`                            |
| `PORT`             | optional     | `3000`                                 |
| `JWT_SECRET`       | yes (prod)   | `dev-secret-change-me` (refuses prod)   |
| `ENABLE_MOCK_AUTH` | optional     | `0`                                    |

See `.env.example` for the full list.

## Database

- `docker compose -f compose.yml up -d postgres` starts Postgres 16 on
  `127.0.0.1:5432` with dev-only credentials and a `farm-pg-data` volume.
- `pnpm db:migrate` applies `src/db/sql/*.up.sql` against
  `MAIN_DB_URL`/`TEST_DB_URL` using `pg` directly (the MikroORM Migrator
  pulls in `umzug`/`emittery` whose pnpm install is broken on
  emittery@0.13). Migration history is tracked in the `_schema_migrations`
  table; `down` rolls back the latest applied row only.
- `pnpm db:reset` drops the volume; this **wipes all data** — never run it
  against a shared environment.