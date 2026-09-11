/**
 * Colyseus FarmRoom — placeholder.
 *
 * Phase 2 task list (NOT implemented now):
 *  - schema() define FarmState (players, plots, ownerId, roomSeed)
 *  - this.clock.setInterval for crop tick (drives matureAt → status)
 *  - message handlers for plant/water/harvest/steal (see packages/shared/src/protocol/ws.ts)
 *  - this.orm.em.fork() + flush() in onDispose
 *
 * Phase 1 only exports the type so app.ts can be wired without a runtime import.
 */

export const FarmRoomPhase2NotImplemented = Symbol('FarmRoomPhase2NotImplemented');

export type FarmRoomStub = {
  readonly phase: 1;
  readonly reason: typeof FarmRoomPhase2NotImplemented;
};