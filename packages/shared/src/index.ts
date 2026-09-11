/**
 * @farm-game/shared — barrel export.
 * Client (Coc/RN) and server (Fastify) both import from this single entry.
 */

export * from './types/index.js';
export * from './time/TimeManager.js';
export * from './eventbus/EventBus.js';
export * from './logic/index.js';
export * from './persistence/storage.js';
export * from './protocol/index.js';