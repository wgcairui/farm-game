/**
 * Platform enum — embedded in JWT, used by server to route login/payment integrations.
 */

export const Platform = {
  WeChatMini: 'weChatMini',
  IOS: 'ios',
  Android: 'android',
  H5Reserve: 'h5Reserve',
} as const;

export type Platform = typeof Platform[keyof typeof Platform];