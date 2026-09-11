/**
 * /farm command routes — POST /farm/{unlock,plant,water,harvest}.
 *
 * Each route validates the JWT, looks up the player, calls the matching
 * command service inside `executeCommand`, then projects the outcome into
 * an `ApiResponse<TCommandResponse>`. The route layer is intentionally
 * thin: business rules live in `services/farm/*` and shared logic in
 * `@farm-game/shared`, so the same services can be reused by Colyseus rooms
 * in G2 without duplicating rules.
 */

import type { FastifyInstance } from 'fastify';
import {
  ErrorCode,
  type ApiResponse,
  type CommandResponse,
  type FarmHarvestResponse,
  type FarmPlantResponse,
  type FarmUnlockResponse,
  type FarmWaterResponse,
} from '@farm-game/shared';
import type { PlayerRepo } from '../repositories/player-repo.js';
import { MikroORMPlayerRepo } from '../repositories/MikroORMPlayerRepo.js';
import { harvestCommand } from '../services/farm/harvest.js';
import { plantCommand } from '../services/farm/plant.js';
import { unlockCommand } from '../services/farm/unlock.js';
import { waterCommand } from '../services/farm/water.js';
import { executeCommand } from '../services/farm/execute.js';

interface FarmRoutesDeps {
  repo: PlayerRepo;
  /** Required when the repo is a MikroORMPlayerRepo — the executeCommand helper wraps the ORM transaction. */
  dbRepo?: MikroORMPlayerRepo;
  /** Required when `dbRepo` is present — the transaction runner for command services. */
  tx?: import('../repositories/transaction.js').TransactionRunner;
}

const bodyBase = {
  type: 'object',
  required: ['operationId', 'body'],
  additionalProperties: false,
  properties: {
    operationId: { type: 'string', minLength: 1, maxLength: 64 },
    body: { type: 'object' },
  },
} as const;

const unlockSchema = {
  ...bodyBase,
  properties: {
    ...bodyBase.properties,
    body: {
      type: 'object',
      required: ['plotIndex'],
      additionalProperties: false,
      properties: { plotIndex: { type: 'integer', minimum: 0, maximum: 23 } },
    },
  },
} as const;

const plantSchema = {
  ...bodyBase,
  properties: {
    ...bodyBase.properties,
    body: {
      type: 'object',
      required: ['plotIndex', 'cropId'],
      additionalProperties: false,
      properties: {
        plotIndex: { type: 'integer', minimum: 0, maximum: 23 },
        cropId: { type: 'string', minLength: 1, maxLength: 32 },
      },
    },
  },
} as const;

const waterSchema = {
  ...bodyBase,
  properties: {
    ...bodyBase.properties,
    body: {
      type: 'object',
      required: ['plotIndex'],
      additionalProperties: false,
      properties: { plotIndex: { type: 'integer', minimum: 0, maximum: 23 } },
    },
  },
} as const;

const harvestSchema = waterSchema;

export async function farmRoutes(app: FastifyInstance, deps: FarmRoutesDeps): Promise<void> {
  const ctx = deps.dbRepo && deps.tx ? { repo: deps.dbRepo, tx: deps.tx } : null;

  // ── /farm/unlock ──
  app.post<{ Body: { operationId: string; body: { plotIndex: number } }; Reply: ApiResponse<FarmUnlockResponse> }>(
    '/farm/unlock',
    { preHandler: app.authenticate, schema: { body: unlockSchema } },
    async (req, reply): Promise<ApiResponse<FarmUnlockResponse>> => {
      if (!ctx) return rejectInMemory(reply);
      const { operationId, body } = req.body;
      const result = await executeCommand(ctx, {
        command: 'unlock',
        playerId: req.user.sub,
        operationId,
        body,
        run: ({ em, playerId, serverNow }) =>
          unlockCommand({ em, playerId, operationId, body, serverNow }),
      });
      return projectResponse(reply, result, { operationId });
    },
  );

  // ── /farm/plant ──
  app.post<{ Body: { operationId: string; body: { plotIndex: number; cropId: string } }; Reply: ApiResponse<FarmPlantResponse> }>(
    '/farm/plant',
    { preHandler: app.authenticate, schema: { body: plantSchema } },
    async (req, reply): Promise<ApiResponse<FarmPlantResponse>> => {
      if (!ctx) return rejectInMemory(reply);
      const { operationId, body } = req.body;
      const result = await executeCommand(ctx, {
        command: 'plant',
        playerId: req.user.sub,
        operationId,
        body,
        run: ({ em, playerId, serverNow }) =>
          plantCommand({ em, playerId, operationId, body, serverNow }),
      });
      return projectResponse(reply, result, { operationId });
    },
  );

  // ── /farm/water ──
  app.post<{ Body: { operationId: string; body: { plotIndex: number } }; Reply: ApiResponse<FarmWaterResponse> }>(
    '/farm/water',
    { preHandler: app.authenticate, schema: { body: waterSchema } },
    async (req, reply): Promise<ApiResponse<FarmWaterResponse>> => {
      if (!ctx) return rejectInMemory(reply);
      const { operationId, body } = req.body;
      const result = await executeCommand(ctx, {
        command: 'water',
        playerId: req.user.sub,
        operationId,
        body,
        run: ({ em, playerId, serverNow }) =>
          waterCommand({ em, playerId, operationId, body, serverNow }),
      });
      return projectResponse(reply, result, { operationId });
    },
  );

  // ── /farm/harvest ──
  app.post<{ Body: { operationId: string; body: { plotIndex: number } }; Reply: ApiResponse<FarmHarvestResponse> }>(
    '/farm/harvest',
    { preHandler: app.authenticate, schema: { body: harvestSchema } },
    async (req, reply): Promise<ApiResponse<FarmHarvestResponse>> => {
      if (!ctx) return rejectInMemory(reply);
      const { operationId, body } = req.body;
      const result = await executeCommand(ctx, {
        command: 'harvest',
        playerId: req.user.sub,
        operationId,
        body,
        run: ({ em, playerId, serverNow }) =>
          harvestCommand({ em, playerId, operationId, body, serverNow }),
      });
      return projectResponse(reply, result, { operationId });
    },
  );
}

function projectResponse<TPayload>(
  reply: import('fastify').FastifyReply,
  result: {
    ok: boolean;
    code?: ErrorCode;
    message?: string;
    payload?: TPayload;
    revision: number;
    operationRevision: number | null;
    replayed: boolean;
    serverNow: number;
    player: import('@farm-game/shared').PlayerSave | null;
  },
  meta: { operationId: string },
): ApiResponse<CommandResponse<TPayload>> {
  if (!result.ok) {
    reply.code(businessHttpStatus(result.code));
    return { ok: false, code: result.code ?? ErrorCode.BAD_REQUEST, message: result.message ?? 'command failed' };
  }
  if (!result.player) {
    // executeCommand guarantees a non-null player on success outcomes; this
    // branch is a defensive guard, not an expected path.
    reply.code(500);
    return { ok: false, code: ErrorCode.INTERNAL, message: 'player state unavailable' };
  }
  const data: CommandResponse<TPayload> = {
    operationId: meta.operationId,
    serverNow: result.serverNow,
    revision: result.revision,
    operationRevision: result.operationRevision,
    replayed: result.replayed,
    player: result.player,
    ...(result.payload !== undefined ? { payload: result.payload } : {}),
  };
  return { ok: true, data };
}

function businessHttpStatus(code: ErrorCode | undefined): number {
  switch (code) {
    case ErrorCode.PLOT_NOT_OWNED:
    case ErrorCode.CROP_UNKNOWN:
    case ErrorCode.PLOT_NOT_EMPTY:
    case ErrorCode.CROP_NOT_RIPE:
    case ErrorCode.WATER_LIMIT_REACHED:
    case ErrorCode.OPERATION_ID_REUSED:
      return 409;
    case ErrorCode.INSUFFICIENT_GOLD:
      return 402;
    case ErrorCode.NOT_AUTHENTICATED:
      return 401;
    case ErrorCode.BAD_REQUEST:
    default:
      return 400;
  }
}

function rejectInMemory(reply: import('fastify').FastifyReply): ApiResponse<never> {
  reply.code(503);
  return {
    ok: false,
    code: ErrorCode.NOT_IMPLEMENTED,
    message: 'farm commands require MAIN_DB_URL (G1 backend); start with `pnpm db:up`',
  };
}