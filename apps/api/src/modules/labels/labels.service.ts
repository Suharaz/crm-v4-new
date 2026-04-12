import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';

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

  async create(data: { name: string; color?: string; category?: string }) {
    const result = await this.prisma.label.create({ data });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_LABELS);
    return result;
  }

  async update(id: bigint, data: { name?: string; color?: string; category?: string; isActive?: boolean }) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) throw new NotFoundException('Không tìm thấy nhãn');
    const result = await this.prisma.label.update({ where: { id }, data });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_LABELS);
    return result;
  }

  // Attach labels to lead
  async attachToLead(leadId: bigint, labelIds: bigint[]) {
    const data = labelIds.map((labelId) => ({ leadId, labelId }));
    await this.prisma.leadLabel.createMany({ data, skipDuplicates: true });
  }

  async detachFromLead(leadId: bigint, labelId: bigint) {
    await this.prisma.leadLabel.deleteMany({ where: { leadId, labelId } });
  }

  // Attach labels to customer
  async attachToCustomer(customerId: bigint, labelIds: bigint[]) {
    const data = labelIds.map((labelId) => ({ customerId, labelId }));
    await this.prisma.customerLabel.createMany({ data, skipDuplicates: true });
  }

  async detachFromCustomer(customerId: bigint, labelId: bigint) {
    await this.prisma.customerLabel.deleteMany({ where: { customerId, labelId } });
  }
}
