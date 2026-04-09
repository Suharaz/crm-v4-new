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
  constructor(private readonly prisma: PrismaClient) {}

  /** Get a setting value by key. Returns null if not found. */
  async get(key: string): Promise<string | null> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  /** Get all settings as key-value object. */
  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemSetting.findMany();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  /** Upsert a setting. */
  async set(key: string, value: string): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}
