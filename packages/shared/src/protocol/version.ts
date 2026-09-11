/**
 * Protocol version — bumping major means breaking change in HTTP body or WS payload shape.
 * Clients send this in `X-Protocol-Version` header; server returns 426 if incompatible.
 *
 * Per ADR-0002 D13: major bumped from 1 → 2 alongside D9 (6 unlocked) +
 * D10 (PlotStatus `ripe`) + D12 (no inventory, harvest awards gold directly).
 * Any 1.x client must be rejected with HTTP 426 + PROTOCOL_VERSION_MISMATCH.
 */

export const PROTOCOL_VERSION = '2.0.0';
export const PROTOCOL_VERSION_MAJOR = 2;