import { Injectable } from '@nestjs/common';
import type { ICache } from './cache.interface';

/**
 * No-op (null) implementation of `ICache`.
 *
 * Used as the default provider until a concrete Redis-backed implementation
 * is wired in a later phase. Keeps the application bootable in Phase 1
 * without requiring Redis to be present.
 *
 * Every method is a documented stub — it performs no I/O and logs nothing.
 * Swap this provider by rebinding `INJECTION_TOKENS.CACHE` in `SharedModule`.
 */
@Injectable()
export class NullCacheService implements ICache {
  public async get<T>(_key: string): Promise<T | null> {
    return null;
  }

  public async set<T>(_key: string, _value: T, _ttlMs?: number): Promise<void> {
    // no-op stub
  }

  public async del(_key: string): Promise<void> {
    // no-op stub
  }

  public async reset(): Promise<void> {
    // no-op stub
  }

  public async wrap<T>(_key: string, factory: () => Promise<T>, _ttlMs?: number): Promise<T> {
    return factory();
  }
}
