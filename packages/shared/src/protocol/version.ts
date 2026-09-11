/**
 * Protocol version — bumping major means breaking change in HTTP body or WS payload shape.
 * Clients send this in `X-Protocol-Version` header; server returns 426 if incompatible.
 */

export const PROTOCOL_VERSION = '1.0.0';
export const PROTOCOL_VERSION_MAJOR = 1;