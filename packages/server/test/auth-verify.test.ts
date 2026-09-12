/**
 * Unit tests for `auth/verify.ts` — JWT verification for the WS process.
 *
 * Tokens are signed with fast-jwt directly (same library, same defaults the
 * HTTP entry's @fastify/jwt wrapper uses): HS256, `iss`/`aud` claims, `exp`
 * from `expiresIn`. The tests pin the parity contract: a token accepted by
 * the HTTP entry is accepted here, and every tampering class maps to the
 * documented ErrorCode.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSigner } from 'fast-jwt';
import { ErrorCode } from '@farm-game/shared';
import { verifyAccessToken, WsAuthError } from '../src/auth/verify.js';

const CONFIG = {
  jwtSecret: 'test-verify-secret',
  jwtIssuer: 'farm-game-test',
  jwtAudience: 'client-test',
};

function sign(payload: Record<string, unknown>, opts?: { expiresIn?: number; key?: string }): string {
  const sign_ = createSigner({ key: opts?.key ?? CONFIG.jwtSecret, ...(opts?.expiresIn !== undefined ? { expiresIn: opts.expiresIn } : {}) });
  return sign_({ iss: CONFIG.jwtIssuer, aud: CONFIG.jwtAudience, ...payload });
}

const IDENTITIES = [{ provider: 'mock', boundAt: 1700000000000, nickname: 'tester' }];

test('verifyAccessToken accepts a token minted the HTTP way (sub/identities/iss/aud/exp)', () => {
  const token = sign({ sub: 'player-1', identities: IDENTITIES }, { expiresIn: 3600 });
  const verified = verifyAccessToken(token, CONFIG);
  assert.equal(verified.sub, 'player-1');
  assert.deepEqual(verified.identities, IDENTITIES);
});

test('verifyAccessToken rejects an expired token with TOKEN_EXPIRED', () => {
  const token = sign({ sub: 'player-1', identities: IDENTITIES }, { expiresIn: -10 });
  assert.throws(() => verifyAccessToken(token, CONFIG), (err: unknown) => {
    return err instanceof WsAuthError && err.code === ErrorCode.TOKEN_EXPIRED;
  });
});

test('verifyAccessToken rejects a wrong issuer with INVALID_TOKEN', () => {
  const token = sign({ sub: 'player-1', identities: IDENTITIES, iss: 'other-issuer' }, { expiresIn: 3600 });
  assert.throws(() => verifyAccessToken(token, CONFIG), (err: unknown) => {
    return err instanceof WsAuthError && err.code === ErrorCode.INVALID_TOKEN;
  });
});

test('verifyAccessToken rejects a wrong audience with INVALID_TOKEN', () => {
  const token = sign({ sub: 'player-1', identities: IDENTITIES, aud: 'other-audience' }, { expiresIn: 3600 });
  assert.throws(() => verifyAccessToken(token, CONFIG), (err: unknown) => {
    return err instanceof WsAuthError && err.code === ErrorCode.INVALID_TOKEN;
  });
});

test('verifyAccessToken rejects a tampered signature with INVALID_TOKEN', () => {
  const token = sign({ sub: 'player-1', identities: IDENTITIES }, { expiresIn: 3600 });
  const tampered = `${token.slice(0, -4)}beef`;
  assert.throws(() => verifyAccessToken(tampered, CONFIG), (err: unknown) => {
    return err instanceof WsAuthError && err.code === ErrorCode.INVALID_TOKEN;
  });
});

test('verifyAccessToken rejects a token signed with a different secret with INVALID_TOKEN', () => {
  const token = sign({ sub: 'player-1', identities: IDENTITIES }, { expiresIn: 3600, key: 'attacker-secret' });
  assert.throws(() => verifyAccessToken(token, CONFIG), (err: unknown) => {
    return err instanceof WsAuthError && err.code === ErrorCode.INVALID_TOKEN;
  });
});

test('verifyAccessToken rejects non-JWT garbage with INVALID_TOKEN', () => {
  assert.throws(() => verifyAccessToken('not-a-jwt', CONFIG), (err: unknown) => {
    return err instanceof WsAuthError && err.code === ErrorCode.INVALID_TOKEN;
  });
});

test('verifyAccessToken rejects a missing or malformed bearer value with NOT_AUTHENTICATED', () => {
  for (const bad of [undefined, null, '', 42]) {
    assert.throws(() => verifyAccessToken(bad, CONFIG), (err: unknown) => {
      return err instanceof WsAuthError && err.code === ErrorCode.NOT_AUTHENTICATED;
    });
  }
});

test('verifyAccessToken rejects a shape-valid signature without the identities claim', () => {
  const token = sign({ sub: 'player-1' }, { expiresIn: 3600 });
  assert.throws(() => verifyAccessToken(token, CONFIG), (err: unknown) => {
    return err instanceof WsAuthError && err.code === ErrorCode.INVALID_TOKEN;
  });
});

test('verifyAccessToken rejects an oversized sub (players.player_id is VARCHAR(36))', () => {
  const token = sign({ sub: 'x'.repeat(37), identities: IDENTITIES }, { expiresIn: 3600 });
  assert.throws(() => verifyAccessToken(token, CONFIG), (err: unknown) => {
    return err instanceof WsAuthError && err.code === ErrorCode.INVALID_TOKEN;
  });
});
