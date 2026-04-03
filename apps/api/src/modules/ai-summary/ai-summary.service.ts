import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiSummaryService {
  private readonly logger = new Logger(AiSummaryService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ConfigService,
  ) {}

  /** Trigger summary chain after a qualifying call. Fire-and-forget. */
  async triggerFromCall(callLog: { matchedEntityType: string | null; matchedEntityId: bigint | null; content: string | null; duration: number | null }) {
    if (!callLog.matchedEntityId || !callLog.matchedEntityType) return;
    if (!callLog.duration || callLog.duration < this.getMinDuration()) return;

    try {
      if (callLog.matchedEntityType === 'LEAD') {
        await this.generateLeadSummary(callLog.matchedEntityId);
      } else if (callLog.matchedEntityType === 'CUSTOMER') {
        await this.generateCustomerSummaries(callLog.matchedEntityId);
      }
    } catch (err) {
      this.logger.error('AI summary failed', err);
    }
  }

  /** Generate lead summary from all activities + call content */
  async generateLeadSummary(leadId: bigint) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId },
      select: {
        id: true, name: true, phone: true, status: true, metadata: true,
        product: { select: { name: true } },
        source: { select: { name: true } },
        customer: { select: { id: true, name: true } },
      },
    });
    if (!lead) return;

    const activities = await this.prisma.activity.findMany({
      where: { entityType: 'LEAD', entityId: leadId, deletedAt: null },
      select: { type: true, content: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const orders = await this.prisma.order.findMany({
      where: { leadId, deletedAt: null },
      select: { status: true, totalAmount: true, product: { select: { name: true } } },
    });

    const prompt = `Bạn là trợ lý CRM. Tóm tắt lead này bằng tiếng Việt, tối đa 2 câu ngắn gọn, nêu keyword chính:

Lead: ${lead.name} (${lead.phone}) — Trạng thái: ${lead.status}
Sản phẩm quan tâm: ${lead.product?.name || 'chưa rõ'}
Nguồn: ${lead.source?.name || 'chưa rõ'}
Hoạt động gần đây (${activities.length}):
${activities.map(a => `- [${a.type}] ${a.content || '(không có nội dung)'}`).join('\n')}
Đơn hàng (${orders.length}):
${orders.map(o => `- ${o.product?.name}: ${o.status} — ${o.totalAmount}`).join('\n') || 'Chưa có'}

Tóm tắt:`;

    const summary = await this.callAI(prompt);
    if (!summary) return;

    const existingMeta = (lead.metadata as Record<string, unknown>) || {};
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { metadata: { ...existingMeta, aiSummary: summary, aiSummaryAt: new Date().toISOString() } },
    });

    // Chain: if lead has customer, generate customer summaries too
    if (lead.customer?.id) {
      await this.generateCustomerSummaries(lead.customer.id);
    }
  }

  /** Generate customer short + detail summaries */
  async generateCustomerSummaries(customerId: bigint) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId },
      select: { id: true, name: true, phone: true, status: true, metadata: true },
    });
    if (!customer) return;

    const leads = await this.prisma.lead.findMany({
      where: { customerId, deletedAt: null },
      select: { name: true, status: true, metadata: true, product: { select: { name: true } }, source: { select: { name: true } } },
    });

    const orders = await this.prisma.order.findMany({
      where: { customerId, deletedAt: null },
      select: { status: true, totalAmount: true, product: { select: { name: true } } },
    });

    const activities = await this.prisma.activity.findMany({
      where: { entityType: 'CUSTOMER', entityId: customerId, deletedAt: null },
      select: { type: true, content: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const existingMeta = (customer.metadata as Record<string, unknown>) || {};
    const prevShort = existingMeta.aiSummaryShort || '';
    const prevDetail = existingMeta.aiSummaryDetail || '';

    const context = `Khách hàng: ${customer.name} (${customer.phone}) — ${customer.status}
Leads (${leads.length}): ${leads.map(l => `${l.name} [${l.status}] SP:${l.product?.name || '?'} ${(l.metadata as any)?.aiSummary || ''}`).join(' | ')}
Đơn hàng (${orders.length}): ${orders.map(o => `${o.product?.name}: ${o.status} ${o.totalAmount}`).join(' | ') || 'Chưa có'}
Hoạt động: ${activities.map(a => `[${a.type}] ${a.content || ''}`).join(' | ')}
Summary trước đó (nếu có): ${prevShort}`;

    // Short summary
    const shortPrompt = `Tóm tắt khách hàng CRM này bằng tiếng Việt, tối đa 1 câu, vài keyword chính:\n\n${context}\n\nTóm tắt ngắn:`;
    const shortSummary = await this.callAI(shortPrompt);

    // Detail summary
    const detailPrompt = `Phân tích chuyên sâu khách hàng CRM này bằng tiếng Việt (3-5 câu). Đánh giá: mức độ tiềm năng, hành vi mua, rủi ro mất KH, đề xuất hành động tiếp theo:\n\n${context}\nSummary chi tiết trước (cập nhật nếu có): ${prevDetail}\n\nPhân tích:`;
    const detailSummary = await this.callAI(detailPrompt);

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        metadata: {
          ...existingMeta,
          ...(shortSummary ? { aiSummaryShort: shortSummary } : {}),
          ...(detailSummary ? { aiSummaryDetail: detailSummary } : {}),
          aiSummaryAt: new Date().toISOString(),
        },
      },
    });
  }

  /** Call AI provider (Gemini default, fallback OpenAI-compatible) */
  private async callAI(prompt: string): Promise<string | null> {
    const apiKey = this.config.get('AI_API_KEY') || this.config.get('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('AI_API_KEY not set, skipping summary');
      return null;
    }

    const provider = this.config.get('AI_PROVIDER') || 'gemini';

    try {
      if (provider === 'gemini') {
        return await this.callGemini(apiKey, prompt);
      }
      // OpenAI-compatible (Claude, OpenAI, etc.)
      return await this.callOpenAICompatible(apiKey, prompt);
    } catch (err) {
      this.logger.error(`AI call failed (${provider})`, err);
      return null;
    }
  }

  private async callGemini(apiKey: string, prompt: string): Promise<string | null> {
    const model = this.config.get('GEMINI_MODEL') || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  }

  private async callOpenAICompatible(apiKey: string, prompt: string): Promise<string | null> {
    const baseUrl = this.config.get('AI_BASE_URL') || 'https://api.openai.com/v1';
    const model = this.config.get('AI_MODEL') || 'gpt-4o-mini';
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 300 }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  }

  /** Get min call duration from config (default 120s = 2 min) */
  private getMinDuration(): number {
    return parseInt(this.config.get('AI_SUMMARY_MIN_DURATION') || '120', 10);
  }
}
