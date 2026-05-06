import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';

interface LabelInput {
  name?: string;
  color?: string;
  category?: string;
  isActive?: boolean;
  /**
   * Auto-recall window for this label, expressed in MINUTES.
   * - `undefined` → don't touch existing config
   * - `null` → delete existing config (turn off recall)
   * - `number > 0` → upsert config
   * Only SUPER_ADMIN may set this field. UI converts user-friendly units
   * (min/hour/day) into minutes before posting.
   */
  recallMinutes?: number | null;
}

interface ActingUser {
  id: bigint;
  role: UserRole;
}

@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  async list(category?: string) {
    const allLabels = await this.cacheService.getOrSet(
      CACHE_KEYS.LOOKUP_LABELS,
      CACHE_TTL.LOOKUP,
      () => this.prisma.label.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    );
    const data = category ? allLabels.filter((l: any) => l.category === category) : allLabels;
    return { data };
  }

  async create(data: LabelInput & { name: string }, user: ActingUser) {
    this._assertCanSetRecall(data, user);
    if (data.recallMinutes !== undefined && data.recallMinutes !== null && data.recallMinutes <= 0) {
      throw new ForbiddenException('Số phút recall phải > 0');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const label = await tx.label.create({
        data: { name: data.name, color: data.color, category: data.category },
      });
      if (data.recallMinutes != null) {
        await tx.labelRecallConfig.create({
          data: { labelId: label.id, recallMinutes: data.recallMinutes, createdBy: user.id },
        });
      }
      return label;
    });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_LABELS);
    return result;
  }

  async update(id: bigint, data: LabelInput, user: ActingUser) {
    this._assertCanSetRecall(data, user);
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) throw new NotFoundException('Không tìm thấy nhãn');

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.label.update({
        where: { id },
        data: {
          name: data.name,
          color: data.color,
          category: data.category,
          isActive: data.isActive,
        },
      });

      if (data.recallMinutes !== undefined) {
        await this._syncRecallConfig(tx, id, data.recallMinutes, user.id);
      }
      return updated;
    });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_LABELS);
    return result;
  }

  async deactivate(id: bigint) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) throw new NotFoundException('Không tìm thấy nhãn');
    const result = await this.prisma.label.update({ where: { id }, data: { isActive: false } });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_LABELS);
    return result;
  }

  /** Reject if non-SUPER_ADMIN tries to set recallMinutes — surface clearly, not silently ignore. */
  private _assertCanSetRecall(data: LabelInput, user: ActingUser) {
    if (data.recallMinutes !== undefined && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Chỉ super admin được cấu hình auto-recall theo nhãn');
    }
  }

  /** Upsert/delete LabelRecallConfig within an existing transaction client. */
  private async _syncRecallConfig(
    tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
    labelId: bigint,
    newMinutes: number | null,
    actingUserId: bigint,
  ) {
    const existing = await tx.labelRecallConfig.findUnique({ where: { labelId } });
    if (newMinutes === null) {
      if (existing) await tx.labelRecallConfig.delete({ where: { id: existing.id } });
      return;
    }
    if (newMinutes <= 0) throw new ForbiddenException('Số phút recall phải > 0');
    if (existing) {
      if (existing.recallMinutes !== newMinutes || !existing.isActive) {
        await tx.labelRecallConfig.update({
          where: { id: existing.id },
          data: { recallMinutes: newMinutes, isActive: true },
        });
      }
    } else {
      await tx.labelRecallConfig.create({
        data: { labelId, recallMinutes: newMinutes, createdBy: actingUserId },
      });
    }
  }

  // Lead has a single label (FK on leads.label_id). Pass null to clear.
  // Also resets labelAssignedAt — used by per-label recall cron.
  async setLeadLabel(leadId: bigint, labelId: bigint | null) {
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { labelId, labelAssignedAt: labelId ? new Date() : null },
    });
  }

  // Customer keeps multi-label (junction table customer_labels)
  async attachToCustomer(customerId: bigint, labelIds: bigint[]) {
    const data = labelIds.map((labelId) => ({ customerId, labelId }));
    await this.prisma.customerLabel.createMany({ data, skipDuplicates: true });
  }

  async detachFromCustomer(customerId: bigint, labelId: bigint) {
    await this.prisma.customerLabel.deleteMany({ where: { customerId, labelId } });
  }
}
