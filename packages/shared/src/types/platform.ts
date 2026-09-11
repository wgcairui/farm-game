/**
 * Platform enum — embedded in JWT, used by server to route login/payment integrations.
 *
 * Per ADR-0002 D15: `H5Reserve` renamed to `H5` to match `AuthProvider.H5`.
 * `H5Reserve` is kept as a deprecated alias to avoid breaking any external
 * integrator; new code must use `Platform.H5`.
 */

export const Platform = {
  WeChatMini: 'weChatMini',
  IOS: 'ios',
  Android: 'android',
  H5: 'h5',
  /** @deprecated Use `Platform.H5`. */
  H5Reserve: 'h5Reserve',
} as const;

export type Platform = typeof Platform[keyof typeof Platform];