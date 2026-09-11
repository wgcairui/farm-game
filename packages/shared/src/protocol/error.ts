/**
 * Error codes — 1000-4999 range, never collide with HTTP status (4xx/5xx codes live separately).
 */

export const ErrorCode = {
  // 1xxx — client-side
  BAD_REQUEST: 1000,
  NOT_AUTHENTICATED: 1100,
  INVALID_TOKEN: 1101,
  PROTOCOL_VERSION_MISMATCH: 1200,
  // 2xxx — auth
  WECHAT_CODE_INVALID: 2000,
  WECHAT_CODE_EXPIRED: 2001,
  // 3xxx — business
  INSUFFICIENT_GOLD: 3000,
  PLOT_NOT_EMPTY: 3001,
  PLOT_NOT_OWNED: 3002,
  CROP_NOT_RIPE: 3003,
  WAREHOUSE_FULL: 3004,
  CROP_UNKNOWN: 3005,
  // 4xxx — server
  INTERNAL: 4000,
  NOT_IMPLEMENTED: 4001,
  MAINTENANCE: 4002,
} as const;

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
  /** Optional field for richer client UX (e.g. retry-after for 1101). */
  detail?: Record<string, unknown>;
}

export function isErrorPayload(v: unknown): v is ErrorPayload {
  return typeof v === 'object' && v !== null && typeof (v as ErrorPayload).code === 'number' && typeof (v as ErrorPayload).message === 'string';
}