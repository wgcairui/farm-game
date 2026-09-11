/**
 * Main business DB — MikroORM configuration.
 *
 * Phase 1: entities list is empty (no schema entities defined yet). This file
 * exists so Phase 2 has the configuration anchor and so the architectural
 * boundary is documented in code (this is the main ORM, NOT the admin ORM).
 */

import type { Options } from '@mikro-orm/core';

export function buildMainDbOptions(dbUrl: string): Options {
  return {
    clientUrl: dbUrl,
    type: 'postgresql',
    pool: { min: 2, max: 15 },
    entities: [],        // Phase 2: register Plot, Player, StealRecord, FriendLink, ...
    migrations: {
      path: './migrations',
      glob: 'Migration*.{ts,js}',
    },
    debug: process.env.NODE_ENV !== 'production',
  } as Options;
}