import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { SystemSettingsService, SETTING_KEYS } from '../system-settings/system-settings.service';

const DEFAULT_CALL_PROMPT = `Bạn là trợ lý CRM phân tích cuộc gọi. Hãy tóm tắt nội dung cuộc gọi bằng tiếng Việt: điểm chính, nhu cầu khách hàng, hành động tiếp theo.`;

const DEFAULT_CUSTOMER_PROMPT = `Bạn là trợ lý CRM phân tích khách hàng. Dựa trên dữ liệu, hãy đánh giá mức độ tiềm năng, hành vi mua, rủi ro mất KH, và đề xuất hành động tiếp theo.`;

/** Fixed wrapper to always extract short + detail + rating from AI output. Length depends on admin prompt. */
const CUSTOMER_OUTPUT_WRAPPER = `

QUAN TRỌNG: Trả lời ĐÚNG format JSON sau (không markdown, không backtick):
{"short":"tóm tắt ngắn","detail":"phân tích chi tiết","rating":3}
Trong đó rating là số nguyên từ 1-5 đánh giá mức độ tiềm năng tổng thể của khách hàng (1=rất thấp, 5=rất cao).`;

@Injectable()
export class AiSummaryService {
  private readonly logger = new Logger(AiSummaryService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ConfigService,
    private readonly settings: SystemSettingsService,
  ) {}

  /** Trigger after call ingest. Analyzes call if >60s, then customer if >120s. */
  async triggerFromCall(callLogId: bigint, callLog: {
    matchedEntityType: string | null;
    matchedEntityId: bigint | null;
    content: string | null;
    duration: number | null;
  }) {
    try {
      // Step 1: Analyze the call itself if duration > 60s
      if (callLog.duration && callLog.duration >= 60 && callLog.content) {
        await this.analyzeCall(callLogId, callLog.content);
      }

      // Step 2: Analyze customer if duration > 120s and matched
      if (
        callLog.duration && callLog.duration >= 120 &&
        callLog.matchedEntityId && callLog.matchedEntityType
      ) {
        let customerId: bigint | null = null;
        if (callLog.matchedEntityType === 'CUSTOMER') {
          customerId = callLog.matchedEntityId;
        } else if (callLog.matchedEntityType === 'LEAD') {
          const lead = await this.prisma.lead.findFirst({
            where: { id: callLog.matchedEntityId },
            select: { customerId: true },
          });
          customerId = lead?.customerId ?? null;
        }
        if (customerId) {
          await this.analyzeCustomer(customerId);
        }
      }
    } catch (err) {
      this.logger.error('AI trigger failed', err);
    }
  }

  /** Analyze a single call log. Save JSON {tags, detail} to callLog.analysis. */
  async analyzeCall(callLogId: bigint, content: string): Promise<string | null> {
    const userPrompt = await this.settings.get(SETTING_KEYS.AI_CALL_ANALYSIS_PROMPT) || DEFAULT_CALL_PROMPT;

    const wrapper = `\n\nQUAN TRỌNG: Trả lời ĐÚNG format JSON sau (không markdown, không backtick):
{"tags":["tag ngắn 1","tag ngắn 2","tag ngắn 3"],"detail":"phân tích chi tiết dạng markdown"}
Trong đó tags là mảng 2-5 nhãn ngắn (3-6 từ) tóm tắt nội dung cuộc gọi, detail là phân tích chi tiết.`;

    const prompt = `${userPrompt}\n\nNội dung cuộc gọi:\n${content}${wrapper}`;
    const raw = await this.callAI(prompt);
    if (!raw) return null;

    // Validate JSON, fallback to plain text wrapped in JSON
    let result: string;
    try {
      const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.tags && parsed.detail) {
        result = JSON.stringify(parsed);
      } else {
        result = JSON.stringify({ tags: [], detail: raw });
      }
    } catch {
      result = JSON.stringify({ tags: [], detail: raw });
    }

    await this.prisma.callLog.update({
      where: { id: callLogId },
      data: { analysis: result },
    });

    return result;
  }

  /** Summarize calls in date range using only tags. Max 150 calls. Fixed prompt. */
  async summarizeCalls(dateFrom: string, dateTo: string): Promise<string | null> {
    const calls = await this.prisma.callLog.findMany({
      where: {
        deletedAt: null,
        callTime: { gte: new Date(dateFrom), lte: new Date(dateTo + 'T23:59:59.999Z') },
        analysis: { not: null },
      },
      select: { analysis: true, callType: true },
      orderBy: { callTime: 'desc' },
      take: 150,
    });

    if (calls.length === 0) return null;

    // Extract only tags from each call analysis
    const allTags: string[] = [];
    const tagCounts: Record<string, number> = {};
    for (const c of calls) {
      try {
        const parsed = JSON.parse(c.analysis!);
        const tags: string[] = parsed.tags || [];
        for (const tag of tags) {
          allTags.push(tag);
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      } catch { /* skip non-JSON */ }
    }

    if (allTags.length === 0) return null;

    // Build tag frequency list
    const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    const tagList = sorted.map(([tag, count]) => `- "${tag}": ${count} lần`).join('\n');

    const prompt = `Bạn là trợ lý CRM phân tích hiệu suất cuộc gọi. Dựa trên các nhãn (tags) được AI gán cho ${calls.length} cuộc gọi trong khoảng ${dateFrom} → ${dateTo}, hãy:

1. **Tổng quan**: Tóm tắt tình hình chung cuộc gọi
2. **Điểm mạnh**: Những xu hướng tích cực (VD: nhiều tag "Khách hài lòng", "Đã chốt đơn"...)
3. **Điểm yếu**: Những vấn đề cần cải thiện (VD: nhiều tag "Khách phàn nàn", "Nhỡ cuộc gọi"...)
4. **Đề xuất**: 2-3 hành động cụ thể để cải thiện

Trả lời bằng tiếng Việt, dùng markdown.

Tần suất nhãn (${sorted.length} loại, ${allTags.length} tổng):
${tagList}`;

    return this.callAI(prompt);
  }

  /** Analyze customer: gather all data, generate short + detail descriptions + rating. */
  async analyzeCustomer(customerId: bigint): Promise<{ short: string; detail: string; rating: number | null } | null> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { id: true, name: true, phone: true, status: true },
    });
    if (!customer) return null;

    // Gather leads
    const leads = await this.prisma.lead.findMany({
      where: { customerId, deletedAt: null },
      select: { id: true, name: true, status: true, product: { select: { name: true } } },
    });
    const leadIds = leads.map(l => l.id);

    // Gather notes (activities from customer + leads)
    const activities = await this.prisma.activity.findMany({
      where: {
        deletedAt: null,
        OR: [
          { entityType: 'CUSTOMER', entityId: customerId },
          ...(leadIds.length > 0 ? [{ entityType: 'LEAD' as const, entityId: { in: leadIds } }] : []),
        ],
      },
      select: { type: true, content: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    // Gather payments
    const orders = await this.prisma.order.findMany({
      where: { customerId, deletedAt: null },
      select: {
        status: true, totalAmount: true,
        product: { select: { name: true } },
        payments: { select: { amount: true, status: true, createdAt: true } },
      },
    });

    // Gather call analyses
    const callLogs = await this.prisma.callLog.findMany({
      where: {
        deletedAt: null,
        analysis: { not: null },
        OR: [
          { matchedEntityType: 'CUSTOMER', matchedEntityId: customerId },
          ...(leadIds.length > 0 ? [{ matchedEntityType: 'LEAD' as const, matchedEntityId: { in: leadIds } }] : []),
        ],
      },
      select: { analysis: true, callTime: true, duration: true },
      orderBy: { callTime: 'desc' },
      take: 10,
    });

    // Build context
    const context = [
      `Khách hàng: ${customer.name} (${customer.phone}) — ${customer.status}`,
      `Leads (${leads.length}): ${leads.map(l => `${l.name} [${l.status}] SP:${l.product?.name || '?'}`).join(' | ') || 'Chưa có'}`,
      `Đơn hàng (${orders.length}): ${orders.map(o => `${o.product?.name}: ${o.status} ${o.totalAmount} — ${o.payments.length} thanh toán`).join(' | ') || 'Chưa có'}`,
      `Ghi chú (${activities.length}): ${activities.map(a => `[${a.type}] ${a.content || ''}`).join(' | ') || 'Chưa có'}`,
      `Phân tích cuộc gọi (${callLogs.length}): ${callLogs.map(c => c.analysis).join(' | ') || 'Chưa có'}`,
    ].join('\n');

    const userPrompt = await this.settings.get(SETTING_KEYS.AI_CUSTOMER_ANALYSIS_PROMPT) || DEFAULT_CUSTOMER_PROMPT;
    const prompt = `${userPrompt}\n\n${context}${CUSTOMER_OUTPUT_WRAPPER}`;
    const raw = await this.callAI(prompt);
    if (!raw) return null;

    // Parse JSON — always extract short + detail + rating
    let short = '';
    let detail = '';
    let rating: number | null = null;
    try {
      const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const json = JSON.parse(cleaned);
      short = json.short || '';
      detail = json.detail || '';
      const parsedRating = parseInt(json.rating, 10);
      if (!isNaN(parsedRating) && parsedRating >= 1 && parsedRating <= 5) {
        rating = parsedRating;
      }
    } catch {
      // Fallback: use full text as detail, first sentence as short
      const sentences = raw.split(/[.。!！\n]/).filter(Boolean);
      short = (sentences[0] || raw).trim().slice(0, 200);
      detail = raw.trim();
    }

    if (short || detail || rating !== null) {
      await this.prisma.customer.update({
        where: { id: customerId },
        data: {
          ...(short ? { shortDescription: short } : {}),
          ...(detail ? { description: detail } : {}),
          ...(rating !== null ? { aiRating: rating } : {}),
        },
      });
    }

    return { short, detail, rating };
  }

  /** Call AI via OpenRouter (settings first, env fallback). */
  private async callAI(prompt: string): Promise<string | null> {
    const apiKey = await this.settings.get(SETTING_KEYS.AI_API_KEY) || this.config.get('AI_API_KEY');
    if (!apiKey) {
      this.logger.warn('AI API key not configured (Settings > AI hoặc env AI_API_KEY)');
      return null;
    }

    const model = await this.settings.get(SETTING_KEYS.AI_MODEL) || this.config.get('AI_MODEL') || 'google/gemini-2.0-flash-exp:free';
    const baseUrl = this.config.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1';

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 1000 }),
      });
      if (!res.ok) {
        this.logger.error(`AI call failed: ${res.status} ${res.statusText}`);
        return null;
      }
      const data: any = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
      this.logger.error('AI call failed', err);
      return null;
    }
  }
}
