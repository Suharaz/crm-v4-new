import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Well-known setting keys. */
export const SETTING_KEYS = {
  AI_API_KEY: 'ai_api_key',
  AI_MODEL: 'ai_model',
  AI_CALL_ANALYSIS_PROMPT: 'ai_call_analysis_prompt',
  AI_CUSTOMER_ANALYSIS_PROMPT: 'ai_customer_analysis_prompt',
} as const;

@Injectable()
export class SystemSettingsService {
  private cache = new Map<string, { value: string | null; expiry: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly prisma: PrismaClient) {}

  /** Get a setting value by key. Returns null if not found. */
  async get(key: string): Promise<string | null> {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) return cached.value;
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    const value = row?.value ?? null;
    this.cache.set(key, { value, expiry: Date.now() + this.CACHE_TTL });
    return value;
  }

  /** Sensitive keys that should be masked in API responses. */
  private static readonly REDACTED_KEYS: Set<string> = new Set([SETTING_KEYS.AI_API_KEY]);

  /** Get all settings as key-value object. Sensitive keys are masked. */
  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemSetting.findMany();
    return Object.fromEntries(
      rows.map(r => [
        r.key,
        SystemSettingsService.REDACTED_KEYS.has(r.key) && r.value
          ? r.value.slice(0, 8) + '••••••'
          : r.value,
      ]),
    );
  }

  /** Upsert a setting. */
  async set(key: string, value: string): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    this.cache.delete(key);
  }
}
