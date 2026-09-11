/**
 * Transaction executor — single seam between business code and the
 * PostgreSQL connection lifecycle.
 *
 * Per ADR-0003 D25: every write command runs inside a freshly forked
 * `EntityManager` context. We never share an EM across requests and we
 * never persist the EM onto the Fastify request scope — the EM is owned by
 * the transaction callback and disposed as soon as it returns.
 *
 * This abstraction also gives us a single chokepoint to inject a fake
 * transaction runner in unit tests (T5+); for integration tests we hit
 * real PostgreSQL with `withMikroOrmTransaction`.
 */

import type { EntityManager, MikroORM } from '@mikro-orm/core';

export interface TransactionRunner {
  /**
   * Run `work` inside a transaction. Commits on success; rolls back on any
   * thrown error and re-throws.
   *
   * The EM passed to `work` is freshly forked; mutating it does not mutate
   * any other request's view.
   */
  run<T>(work: (em: EntityManager) => Promise<T>): Promise<T>;
}

export function makeMikroOrmTransactionRunner(orm: MikroORM): TransactionRunner {
  return {
    async run<T>(work: (em: EntityManager) => Promise<T>): Promise<T> {
      // Use a fresh EM per call; isolation is per-EM in MikroORM v6.
      return orm.em.fork().transactional(work);
    },
  };
}