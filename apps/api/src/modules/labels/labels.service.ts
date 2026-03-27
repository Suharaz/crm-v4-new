import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(category?: string) {
    const where: Record<string, unknown> = { isActive: true };
    if (category) where.category = category;

    const data = await this.prisma.label.findMany({ where, orderBy: { name: 'asc' } });
    return { data };
  }

  async create(data: { name: string; color?: string; category?: string }) {
    return this.prisma.label.create({ data });
  }

  async update(id: bigint, data: { name?: string; color?: string; category?: string; isActive?: boolean }) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) throw new NotFoundException('Không tìm thấy nhãn');
    return this.prisma.label.update({ where: { id }, data });
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
