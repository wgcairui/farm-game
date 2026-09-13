# @farm-game/server

Fastify + MikroORM + PostgreSQL backend for the global farm-game API.
Phase 2 G1 (ADR-0003) ships real persistence and atomic domain commands
(`/auth/*`, `/player/*`, `/farm/{unlock,plant,water,harvest}`).

## Quick start

```bash
# 1. Start Postgres + Redis + nginx (loopback only — 5432 / 6380 / 8080)
pnpm db:up

# 2. Apply G1 schema migrations
pnpm db:migrate

# 3. Run the server (picks up MAIN_DB_URL from .env or env vars)
cp .env.example .env          # first time only — ENABLE_MOCK_AUTH=1 lives here
pnpm dev                      # Fastify on host:3000
pnpm dev:ws                   # Colyseus on host:2567 (separate terminal)
```

Server logs include `db: postgresql` and the protocol version on boot.

### One-port debug workflow (added 2026-09-14)

The `db:up` script also starts `nginx:1.27-alpine` on `127.0.0.1:8080` so the
team can hit everything through one port during a debug session — no more
guessing which of 3000 / 2567 is which:

| URL                              | Routed to                  | Notes                                 |
|----------------------------------|----------------------------|---------------------------------------|
| `http://127.0.0.1:8080/api/*`     | host Fastify (`:3000`)     | `/api/auth/wechat`, `/api/player/info`, … |
| `ws://127.0.0.1:8080/ws`         | host Colyseus (`:2567`)    | Colyseus SDK farm room                |
| `http://127.0.0.1:8080/`         | static `build/wechatgame/` | game.json + cocos-js + assets         |
| `http://127.0.0.1:5432`          | (host direct)              | Postgres, `psql` straight from host   |
| `http://127.0.0.1:6380`          | (host direct)              | Redis, `redis-cli` from host          |

Nginx reaches the host processes via `host.docker.internal` (Docker Desktop
magic) and serves the live `build/wechatgame/` directory over a bind mount,
so every `pnpm build:cocos` shows up at `http://127.0.0.1:8080/game.json`
without rebuilding the container. Configure on Linux Docker without that
magic by switching the upstream hosts to `127.0.0.1` and the service to
`network_mode: host`.

Helper scripts (all proxy `docker compose -f compose.yml …`):

```bash
pnpm db:status          # show pg / redis / nginx state
pnpm db:logs            # follow logs from all three services
pnpm db:shell           # drop into nginx container (busybox sh)
SERVICE=postgres pnpm db:shell -- psql -U farm -d farm_game  # postgres
SERVICE=redis    pnpm db:shell -- redis-cli -p 6379 PING      # redis
pnpm db:lint            # compose schema validation
```

Smoke-test the full stack without touching the game client:

```bash
curl -s http://127.0.0.1:8080/api/healthz
# → {"ok":true,"uptime":<n>,"protocolVersion":"2.0.0"}

curl -s -X POST http://127.0.0.1:8080/api/auth/wechat \
  -H 'Content-Type: application/json' \
  -d '{"code":"mock_dev_cocos_simulator"}' | jq .data.player.gold
# → 500  (the seeded dev player starts with 500 gold)

curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/game.json
# → 200   (Cocos build dir mounted into nginx; rebuild wechatgame to refresh)
```

When nginx can't reach the host backend, `/api/healthz` will return 502 —
the container is up but `host.docker.internal:3000` is unreachable. Check
that step 3 (Fastify) is actually running.

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

## Architecture

> Phase 2 G2 server-side architecture: HTTP (Fastify) + WS (Colyseus) as
> two independent processes sharing a single MikroORM-managed Postgres
> database. This section explains the *why* of the directory layout,
> command pipeline, lease arbitration, and idempotency model so new
> contributors don't have to re-derive them from the source.

### Process topology

Two Node.js processes share one PostgreSQL instance and (optionally) one
Redis instance:

| Process | Entry                    | Port | Role                                    |
|---------|--------------------------|------|-----------------------------------------|
| HTTP    | `src/index.ts`           | 3000 | Fastify REST API (`/auth`, `/farm`, …)  |
| WS      | `src/realtime/serve.ts`  | 2567 | Colyseus farm rooms (`farm_cmd` writes) |

Boot wiring is shared via [`src/bootstrap.ts`](src/bootstrap.ts): both
entries call `bootstrapDatabase(config)` which applies pending migrations
under a PostgreSQL advisory lock (so two processes can boot concurrently
against a fresh DB), initialises one `MikroORM`, and creates a small
dedicated `pg.Pool` for lease statements.

Redis is optional and **only the WS entry touches it** — `RedisDriver`
(matchmaker directory) + `RedisPresence` (cross-process events). Without
`REDIS_URL` set, the WS entry falls back to the in-process
`LocalDriver`/`LocalPresence` (development only). The HTTP entry never
connects to Redis.

### Directory organisation

```
src/
├── index.ts            # HTTP entry
├── app.ts              # Fastify app factory
├── bootstrap.ts        # shared boot wiring
├── config.ts           # env-var loader
├── auth/               # /auth/* routes + JWT helpers
├── player/             # /player/info
├── crop/               # /crop/configs (open)
├── farm/               # /farm/{unlock,plant,water,harvest} routes (thin shells)
├── realtime/           # WS entry, FarmRoom, Redis infra, ws-messages
├── repositories/       # PlayerRepo + RoomLeaseRepo + tx runner
├── services/           # business logic (services/farm/*)
├── db/                 # MikroORM config, migrations, entities
├── admin/              # @colyseus/admin boundary (placeholder)
└── obs/                # pino logger
```

The layout mixes three organising principles by design:

- **URL-routed at the top** — `auth/`, `player/`, `crop/`, `farm/` each
  own one URL prefix and its route file. Adding a route is local.
- **Transport-isolated at the top** — `realtime/` is its own column, not
  a sub-folder of `farm/`. WS owns its process entry, message envelope,
  and infrastructure (Redis, revision watcher).
- **Layer-shared in the middle** — `repositories/`, `services/`, `db/`,
  `obs/` are horizontal slices: persistence, business logic, schema,
  cross-cutting concerns.

This is neither pure DDD (no bounded-context folders, no aggregates) nor
pure technical-layer (controllers/services/repositories). See
[§ Trade-offs](#trade-offs-and-when-to-re-evaluate) for why.

### Why `services/farm/` lives between the two transports

The four command services (`unlockCommand`, `plantCommand`,
`waterCommand`, `harvestCommand`) are called from **both** the HTTP
routes ([`farm/routes.ts:103`](src/farm/routes.ts)) and the WS room
([`realtime/room.ts:555`](src/realtime/room.ts)). Putting them under
`farm/` would force WS to reach into the HTTP transport's folder; putting
them under `realtime/` would force HTTP to depend on the WS transport.
The `services/` middle layer is the only place that satisfies both.

The route layer is intentionally a thin shell (see
[`farm/routes.ts:1-9`](src/farm/routes.ts) header comment): JSON-schema
validation, JWT check, `executeCommand()`, project response. All business
rules live in `services/farm/`.

### Database is the sole authority; messages are projections

Per [`realtime/room.ts:24-26`](src/realtime/room.ts), the farm room does
**not** maintain a Colyseus state object. Every broadcast
(`welcome`, `plot_updated`, `gold_updated`) is a fresh materialisation
of the latest Postgres state inside the calling transaction.

Trade-off: each broadcast re-reads the player row + 24 plots. For MVP
scale this is cheap (single PK lookup + an indexed scan); at higher
throughput we would switch to incremental projections driven by revision
deltas.

### Command pipeline (HTTP + WS share one core)

```
client               HTTP route / WS room         services/farm/*             PostgreSQL
  │                       │                            │                          │
  │  POST /farm/plant     │                            │                          │
  │  ────────────────────►│                            │                          │
  │                       │  executeCommand(ctx, args) │                          │
  │                       │  ─────────────────────────►│                          │
  │                       │   tx.run(em => {           │                          │
  │                       │                            │  run({em, ...}) →         │
  │                       │                            │    [WS] leases.assertCurrent(em, lease)
  │                       │                            │    plantCommand({em, ...})│
  │                       │                            │      SELECT player FOR UPDATE
  │                       │                            │      loadReceipt(em, …)   │
  │                       │                            │      [business checks]    │
  │                       │                            │      [mutate player/plot] │
  │                       │                            │      persistReceipt({…})  │
  │                       │                            │    materialisePlayer(em) │
  │                       │  ◄─────────────────────────│                          │
  │                       │  ExecuteResult{ok, payload,│                          │
  │                       │               revision,    │                          │
  │                       │               operationRevision, replayed, player}     │
  │                       │  toCommandResponse(...)    │                          │
  │  200 / cmd_result     │                            │                          │
  │  ◄────────────────────│                            │                          │
  │                       │   commit                  ─►  COMMIT (asset + receipt)
```

Invariants:

- **Atomicity**: asset mutation + `operation_receipts` insert commit
  together. A rollback leaves no receipt; the client can safely retry
  the same `operationId`.
- **Cross-transport identity**: the same `(playerId, operationId)` is
  honoured by both HTTP and WS — a retry that lands on a different
  transport replays the original outcome.
- **Fencing (WS only)**: `leases.assertCurrent(em, lease)` runs `SELECT
  … FOR UPDATE` on the lease row inside the command transaction. A room
  whose lease was taken over rolls back instead of writing.

### Idempotency: `operation_receipts` is the single dedup source

Every write command carries a client-generated `operationId`. The
`operation_receipts` table has a `UNIQUE(player_id, operation_id)`
constraint ([`OperationReceipt.ts:51-56`](src/db/entities/OperationReceipt.ts))
which is the **last line of defence** — even if the application-level
check fails, the INSERT collides and the error propagates as
`OPERATION_ID_REUSED`.

Replay semantics ([`src/services/farm/receipts.ts`](src/services/farm/receipts.ts)):

| Stored receipt         | Incoming `(command, requestHash)` | Verdict                                    |
|------------------------|-----------------------------------|--------------------------------------------|
| none                   | —                                 | run command, persist fresh receipt         |
| same command + same hash | same                             | replay stored outcome, mark `replayed: true` |
| different command/hash | different                         | `OPERATION_ID_REUSED` (HTTP 409)           |

`requestHash` is `SHA-256(canonicaliseBody(body))` and is checked together
with `command`. This closes the gap where `water(plot 0)` and
`harvest(plot 0)` would otherwise replay each other because their bodies
share the same shape.

Successful responses carry three revision fields:

- `revision` — current `players.revision` at response time; clients
  overlay this on their local state.
- `operationRevision` — the revision recorded on the original receipt.
  Equals `revision` for fresh executions; older for replays.
- `replayed` — `true` when the outcome came from a persisted receipt.

Transient errors (deadlock, connection drop) **never** persist a receipt;
the transaction rolls back and the caller may retry with the same
`operationId`.

### Lease arbitration: Postgres is the only ownership arbiter

A farm room's *write authority* is decided by a PostgreSQL lease, not by
Redis. Redis only coordinates room discovery (`RedisDriver`) and
cross-process presence (`RedisPresence`); it grants no write rights.

`RoomLeaseRepo`
([`src/repositories/room-lease-repo.ts`](src/repositories/room-lease-repo.ts))
exposes four operations:

| Op               | Used by                                       | Purpose                                                            |
|------------------|-----------------------------------------------|--------------------------------------------------------------------|
| `acquire`        | `FarmRoom.onCreate`                           | take over an expired lease or extend own; rejects live others      |
| `renew`          | `FarmRoom` interval (`leaseRenewMs`)          | extend live lease; `null` if lost                                  |
| `release`        | `FarmRoom.onDispose` / `loseLease`            | expire own row; no-op when already gone                            |
| `assertCurrent`  | `executeCommand` callback in WS room          | `SELECT … FOR UPDATE` inside tx; fail closed if lock lost          |

`assertCurrent` reads `em.getTransactionContext()` and refuses to run
without one — a lock-free check would be security theatre
([`room-lease-repo.ts:225`](src/repositories/room-lease-repo.ts)). The
row lock is held until the command transaction commits, blocking any
concurrent takeover.

Failure budget (validated by `loadConfig`):

```
leaseRenewMs × LEASE_RENEW_FAILURES_ALLOWED < leaseTtlMs
```

Two consecutive renew failures → `loseLease()` → stop renewing, release
the lease, `disconnect()` all clients. Clients re-route to the surviving
instance via `joinOrCreate('farm', { ownerId })`, which lands on the
instance that now holds the lease (epoch + 1).

### Cross-process change push (Revision Watcher)

The room is the write authority for its own farm, but the same player's
state can change *outside* the room: HTTP commands (another device),
future admin actions, scripts. The room cannot learn about those from
its own command path, so `RoomRevisionWatcher`
([`src/realtime/revision-watcher.ts`](src/realtime/revision-watcher.ts))
polls every `REFRESH_POLL_MS` (default 1s):

```sql
SELECT player_id, revision FROM players
  WHERE player_id IN (<chunked active owners>);
```

For any room whose `players.revision` has moved past its
`lastProjectedRevision`, the watcher re-`materialisePlayer` and
broadcasts a fresh `welcome` envelope. Clients dedup by `revision` (per
ADR-0003 D18) so a pushed snapshot older than the client's local one is
ignored.

Polling (vs LISTEN/NOTIFY) was chosen because it adds no connection
lifecycle, works identically with `LocalDriver` (no Redis) in dev, and
the query cost at MVP scale is negligible.

### Error model

HTTP and WS share one envelope:

```ts
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string; detail?: unknown };
```

`setErrorHandler` in [`src/app.ts:85`](src/app.ts) translates Fastify
errors (401 → `NOT_AUTHENTICATED`, 403 → `WECHAT_CODE_INVALID`, 4xx →
`BAD_REQUEST`, 5xx → `INTERNAL`).

The farm routes map business codes to HTTP statuses via
`businessHttpStatus` ([`src/farm/routes.ts:206`](src/farm/routes.ts)):
409 for business conflict, 402 for insufficient gold, 401 for missing
auth, 400 otherwise.

WS errors use the same `ErrorCode` constants wrapped in the standard
envelope: `{ v, t: 'error', r?: <operationId>, p: { code, message }, ts }`.
The `r` field echoes the request's `operationId` when known so the
client can correlate.

### Trade-offs and when to re-evaluate

The current organisation optimises for:

- **URL locality** at the top — adding a route is local.
- **Service reuse across transports** — one business rule, two callers.
- **Transport isolation** — HTTP and WS are independent processes, can
  scale separately, can fail separately.
- **DB-as-authority** — no state-drift bugs, idempotency at the storage
  layer, easy to reason about.

It is **not** a DDD bounded-context layout (no aggregates, no domain
events, no ACLs) and **not** a pure technical-layer layout. It is a
modular monolith biased toward "where does the URL/route go" and "how
do the two transports share".

Re-evaluate the architecture when **any** of these appears:

1. `services/farm/` helper count exceeds ~12 — too much repeated
   boilerplate; switch to vertical slices per command.
2. A genuinely separate domain appears (friendship / guild / trading).
   Switch to bounded-context folders (Identity / Farm / World / etc.).
3. Non-HTTP/WS workers need to reuse business logic (cron jobs, batch
   analytics, offline simulation). Split `server-core` out of the
   monorepo.
4. The WS and HTTP processes start writing to tables that the other
   process reads but doesn't know about. That's the moment for
   event-driven decoupling (Redis Streams / outbox) or service split.

Until then the current shape is the cheapest place to add the next
feature.

### See also

- [`docs/architecture.md`](../../docs/architecture.md) — system-level
  node topology, client matrix, scaling phases.
- [`packages/server/AGENTS.md`](./AGENTS.md) — port matrix, directory
  shape, workflow rules for contributors.
- [`docs/adr/0003-g1-persistence-and-commands.md`](../../docs/adr/0003-g1-persistence-and-commands.md) —
  persistence + `operationId` + `revision` decisions.
- [`docs/adr/0004-g2-ws-protocol-and-auth.md`](../../docs/adr/0004-g2-ws-protocol-and-auth.md) —
  WS protocol + auth gate.
- [`docs/adr/0005-g2-realtime-ops.md`](../../docs/adr/0005-g2-realtime-ops.md) —
  cross-process + failure matrix (D38–D43).

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