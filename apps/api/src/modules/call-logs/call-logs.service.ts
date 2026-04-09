import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaClient, Prisma, EntityType } from '@prisma/client';
import { normalizePhone } from '@crm/utils';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AiSummaryService } from '../ai-summary/ai-summary.service';

const CALL_LOG_SELECT = {
  id: true, externalId: true, phoneNumber: true, callType: true,
  callTime: true, duration: true, content: true, analysis: true,
  matchedEntityType: true, matchedEntityId: true, matchedUserId: true,
  matchStatus: true, createdAt: true,
} satisfies Prisma.CallLogSelect;

@Injectable()
export class CallLogsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiSummary: AiSummaryService,
  ) {}

  async list(query: PaginationQueryDto & { matchStatus?: string; matchedUserFilter?: bigint; dateFrom?: string; dateTo?: string }) {
    const limit = query.limit ?? 20;
    const where: Prisma.CallLogWhereInput = { deletedAt: null };
    if (query.matchStatus) where.matchStatus = query.matchStatus as any;
    if (query.matchedUserFilter) where.matchedUserId = query.matchedUserFilter;
    // Date range filter
    if (query.dateFrom || query.dateTo) {
      where.callTime = {};
      if (query.dateFrom) where.callTime.gte = new Date(query.dateFrom);
      if (query.dateTo) where.callTime.lte = new Date(query.dateTo + 'T23:59:59.999Z');
    }

    const logs = await this.prisma.callLog.findMany({
      where, select: CALL_LOG_SELECT, orderBy: { callTime: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: BigInt(query.cursor) } } : {}),
    });

    const hasMore = logs.length > limit;
    const data = hasMore ? logs.slice(0, limit) : logs;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  async listUnmatched(limit = 20, cursor?: string) {
    return this.list({ limit, cursor, matchStatus: 'UNMATCHED' });
  }

  /** Ingest call from 3rd party. Auto-match by phone number. */
  async ingest(data: {
    externalId: string; phoneNumber: string; callType: string;
    callTime: string; duration?: number; content?: string;
  }) {
    // Dedup by external_id
    const existing = await this.prisma.callLog.findUnique({
      where: { externalId: data.externalId },
    });
    if (existing) throw new ConflictException('Cuộc gọi đã tồn tại (trùng external_id)');

    const phone = normalizePhone(data.phoneNumber);

    // Auto-match: search leads first, then customers
    let matchedEntityType: EntityType | null = null;
    let matchedEntityId: bigint | null = null;
    let matchedUserId: bigint | null = null;
    let matchStatus: 'AUTO_MATCHED' | 'UNMATCHED' = 'UNMATCHED';

    // Try match lead
    const lead = await this.prisma.lead.findFirst({
      where: { phone, deletedAt: null, assignedUserId: { not: null } },
      select: { id: true, assignedUserId: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (lead) {
      matchedEntityType = 'LEAD';
      matchedEntityId = lead.id;
      matchedUserId = lead.assignedUserId;
      matchStatus = 'AUTO_MATCHED';
    } else {
      // Try match customer
      const customer = await this.prisma.customer.findFirst({
        where: { phone, deletedAt: null },
        select: { id: true, assignedUserId: true },
      });
      if (customer) {
        matchedEntityType = 'CUSTOMER';
        matchedEntityId = customer.id;
        matchedUserId = customer.assignedUserId;
        matchStatus = 'AUTO_MATCHED';
      }
    }

    const callLog = await this.prisma.callLog.create({
      data: {
        externalId: data.externalId,
        phoneNumber: phone,
        callType: data.callType as any,
        callTime: new Date(data.callTime),
        duration: data.duration ?? 0,
        content: data.content,
        matchedEntityType,
        matchedEntityId,
        matchedUserId,
        matchStatus,
      },
      select: CALL_LOG_SELECT,
    });

    // If matched, create activity on entity timeline
    if (matchedEntityType && matchedEntityId && matchedUserId) {
      await this.prisma.activity.create({
        data: {
          entityType: matchedEntityType,
          entityId: matchedEntityId,
          userId: matchedUserId,
          type: 'CALL',
          content: `Cuộc gọi ${data.callType}: ${data.duration ?? 0}s`,
          metadata: { callLogId: callLog.id.toString(), callType: data.callType, duration: data.duration },
        },
      });

      // Auto IN_PROGRESS trigger if lead is ASSIGNED
      if (matchedEntityType === 'LEAD') {
        const assignedLead = await this.prisma.lead.findFirst({
          where: { id: matchedEntityId, status: 'ASSIGNED', deletedAt: null },
        });
        if (assignedLead) {
          await this.prisma.lead.update({ where: { id: matchedEntityId }, data: { status: 'IN_PROGRESS' } });
          await this.prisma.activity.create({
            data: {
              entityType: 'LEAD', entityId: matchedEntityId, userId: matchedUserId,
              type: 'STATUS_CHANGE',
              content: 'ASSIGNED → IN_PROGRESS (tự động khi có cuộc gọi)',
              metadata: { auto: true },
            },
          });
        }
      }
    }

    // Fire-and-forget: AI call analysis (>60s) + customer analysis (>120s)
    this.aiSummary.triggerFromCall(callLog.id, {
      matchedEntityType, matchedEntityId,
      content: data.content || null,
      duration: data.duration || null,
    }).catch(() => {});

    return callLog;
  }

  /** Manual match: link unmatched call to an entity. */
  async manualMatch(callId: bigint, entityType: EntityType, entityId: bigint, userId: bigint) {
    const call = await this.prisma.callLog.findFirst({
      where: { id: callId, matchStatus: 'UNMATCHED', deletedAt: null },
    });
    if (!call) throw new NotFoundException('Cuộc gọi không tìm thấy hoặc đã được ghép');

    await this.prisma.callLog.update({
      where: { id: callId },
      data: {
        matchedEntityType: entityType,
        matchedEntityId: entityId,
        matchedUserId: userId,
        matchStatus: 'MANUALLY_MATCHED',
        verifiedBy: userId,
      },
    });

    // Create activity
    await this.prisma.activity.create({
      data: {
        entityType, entityId, userId,
        type: 'CALL',
        content: `Cuộc gọi ghép thủ công: ${call.callType} ${call.duration}s`,
        metadata: { callLogId: callId.toString(), manual: true },
      },
    });

    return this.prisma.callLog.findUnique({ where: { id: callId }, select: CALL_LOG_SELECT });
  }
}
