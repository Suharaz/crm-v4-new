import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CACHE_PREFIX } from './cache.constants';

/** BigInt-safe serializer: marks BigInt values for round-trip fidelity */
function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, val) =>
    typeof val === 'bigint' ? `__bigint__${val.toString()}` : val,
  );
}

function deserialize<T>(raw: string): T {
  return JSON.parse(raw, (_key, val) => {
    if (typeof val === 'string' && val.startsWith('__bigint__')) {
      return BigInt(val.slice(10));
    }
    return val;
  }) as T;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.cache.get<string>(key);
      if (!raw) {
        this.logger.debug(`MISS ${key}`);
        return null;
      }
      this.logger.debug(`HIT ${key}`);
      return deserialize<T>(raw);
    } catch (err) {
      this.logger.warn(`Cache GET error for ${key}: ${err}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttl: number): Promise<void> {
    try {
      const raw = serialize(value);
      if (raw.length > 1_048_576) {
        this.logger.warn(`Skipping cache SET for ${key}: payload ${raw.length} bytes exceeds 1MB`);
        return;
      }
      await this.cache.set(key, raw, ttl * 1000);
    } catch (err) {
      this.logger.warn(`Cache SET error for ${key}: ${err}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cache.del(key);
      this.logger.debug(`DEL ${key}`);
    } catch (err) {
      this.logger.warn(`Cache DEL error for ${key}: ${err}`);
    }
  }

  /**
   * Delete all keys matching a prefix using SCAN (non-blocking).
   * ioredis keyPrefix auto-prepends to all commands, so scanStream pattern
   * must NOT include the keyPrefix — ioredis adds it automatically.
   * Returned keys from scanStream include the keyPrefix; strip it before
   * calling cache.del() to avoid double-prefixing.
   */
  async delByPrefix(prefix: string): Promise<void> {
    try {
      const store = (this.cache as any).store ?? (this.cache as any).stores?.[0];
      const client = store?.client ?? store?.getClient?.();
      if (!client?.scanStream) {
        this.logger.warn('Cache store does not support scanStream() for prefix deletion');
        return;
      }
      // ioredis prepends keyPrefix automatically — pattern uses only app prefix
      const stream = client.scanStream({ match: `${prefix}*`, count: 100 });
      const keys: string[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (batch: string[]) => { keys.push(...batch); });
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      if (keys.length > 0) {
        // Returned keys include full keyPrefix; strip it for cache.del()
        const stripped = keys.map(k => k.startsWith(CACHE_PREFIX) ? k.slice(CACHE_PREFIX.length) : k);
        await Promise.all(stripped.map(k => this.cache.del(k)));
        this.logger.debug(`DEL prefix ${prefix} — ${keys.length} keys`);
      }
    } catch (err) {
      this.logger.warn(`Cache DEL prefix error for ${prefix}: ${err}`);
    }
  }

  async getOrSet<T>(key: string, ttl: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }
}
