/**
 * Auth-repo compatibility shim.
 *
 * History:
 *  - G0/G0.5 (Phase 2 ADR-0001 + ADR-0002): `PlayerRepo`, `InMemoryPlayerRepo`,
 *    `ensurePlayer`, `generatePlayerId`, and `IdentityAlreadyBoundError` all
 *    lived here.
 *  - G1 (ADR-0003): the contract is split into `repositories/player-repo.ts`
 *    (interface + ensurePlayer + UUID generator), and the in-memory and
 *    MikroORM implementations live in `repositories/{InMemory,MikroORM}PlayerRepo.ts`.
 *
 * To keep the existing import paths (`./auth/repo.js`) working without
 * touching every callsite, this file re-exports the symbols from their
 * new homes. Tests and route handlers continue to import from
 * `../auth/repo.js` exactly as before.
 */

export {
  IdentityAlreadyBoundError,
  ensurePlayer,
  generatePlayerId,
  type PlayerRepo,
} from '../repositories/player-repo.js';

export { InMemoryPlayerRepo } from '../repositories/InMemoryPlayerRepo.js';