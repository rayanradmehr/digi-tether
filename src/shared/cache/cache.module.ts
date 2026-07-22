import { Global, Module } from '@nestjs/common';
import { INJECTION_TOKENS } from '../tokens/injection-tokens';
import { NullCacheService } from './cache.service';

/**
 * Registers the cache provider globally under `INJECTION_TOKENS.CACHE`.
 *
 * Phase 1: uses `NullCacheService` (no-op). Replace `useClass` with a
 * Redis-backed implementation in a later phase without touching consumers.
 */
@Global()
@Module({
  providers: [
    {
      provide: INJECTION_TOKENS.CACHE,
      useClass: NullCacheService,
    },
  ],
  exports: [INJECTION_TOKENS.CACHE],
})
export class CacheModule {}
