/**
 * Password hashing — self-describing format so we can swap algorithms
 * without breaking existing hashes.
 *
 * Current default: scrypt (Node built-in `crypto.scrypt`). scrypt is
 * memory-hard, has no native dependency, and ships with Node 20+. Tuned
 * for ~100ms wall time on a single modern core: N=16384 / r=8 / p=1.
 *
 * Format:
 *   scrypt$N=<int>,r=<int>,p=<int>$<salt-base64>$<hash-base64>
 *
 * The leading `scrypt$…` segment is a future-proof algorithm tag. An
 * argon2id upgrade (planned per ADR-0006 §7 / follow-up ADR-0007) would
 * produce `argon2id$…$…` strings; verify() dispatches on the prefix.
 * Old scrypt hashes stay valid until password is changed.
 *
 * Why not bcrypt: bcrypt has the most mature npm ecosystem but ships a
 * native binding. scrypt gives us the same security posture without the
 * binary dependency on every dev machine + CI runner + Docker image.
 *
 * Salt: 16 bytes from `crypto.randomBytes` per password. Hash: 64 bytes
 * (truncated from scrypt's output, plenty of bits for password work).
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024; // 64 MiB hard cap (scrypt rule of thumb: 32 * N * r)
const SALT_BYTES = 16;
const KEY_BYTES = 64;

export class PasswordError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'PasswordError';
  }
}

/**
 * Hash a plaintext password into the self-describing format described
 * at the top of this file. Throws `PasswordError` only on programmer
 * error (maxmem misconfig); never on user input.
 */
export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new PasswordError('hashPassword: plaintext must be a non-empty string');
  }
  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(plain, salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `scrypt$N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/**
 * Verify a plaintext against a previously-hashed value. Constant-time
 * comparison so timing attacks can't leak the hash. Returns false on
 * any malformed input (wrong algorithm tag, bad base64, length mismatch)
 * — never throws on user input.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (typeof plain !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt' || !parts[1]?.startsWith('N=')) return false;
  const params = parseScryptParams(parts[1]);
  if (!params) return false;
  const saltB64 = parts[2];
  const hashB64 = parts[3];
  if (!saltB64 || !hashB64) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, 'base64');
    expected = Buffer.from(hashB64, 'base64');
  } catch {
    return false;
  }
  if (expected.length !== KEY_BYTES) return false;

  let actual: Buffer;
  try {
    actual = await scryptAsync(plain, salt, expected.length, {
      N: params.N,
      r: params.r,
      p: params.p,
      maxmem: Math.max(SCRYPT_MAXMEM, 32 * params.N * params.r * 2),
    });
  } catch {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

function parseScryptParams(s: string): { N: number; r: number; p: number } | null {
  // Format: N=16384,r=8,p=1
  const out: Record<string, number> = {};
  for (const kv of s.split(',')) {
    const [k, v] = kv.split('=');
    if (!k || !v) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    out[k] = n;
  }
  if (!out.N || !out.r || !out.p) return null;
  return { N: out.N, r: out.r, p: out.p };
}
