import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaClient, LeadStatus, CustomerStatus } from '@prisma/client';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class RecallConfigService {
  private readonly logger = new Logger(RecallConfigService.name);

  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    const configs = await this.prisma.recallConfig.findMany({
      orderBy: [{ entityType: 'asc' }, { createdAt: 'asc' }],
      include: { creator: { select: { id: true, name: true } } },
    });
    return { data: configs };
  }

  async getById(id: bigint) {
    const config = await this.prisma.recallConfig.findUnique({
      where: { id },
      include: { creator: { select: { id: true, name: true } } },
    });
    if (!config) throw new NotFoundException('Cấu hình auto-recall không tồn tại');
    return { data: config };
  }

  async create(
    data: { entityType: string; maxDaysInPool: number; autoLabelIds: bigint[] },
    createdBy: bigint,
  ) {
    const config = await this.prisma.recallConfig.create({
      data: {
        entityType: data.entityType,
        maxDaysInPool: data.maxDaysInPool,
        autoLabelIds: data.autoLabelIds,
        createdBy,
      },
      include: { creator: { select: { id: true, name: true } } },
    });
    return { data: config };
  }

  async update(
    id: bigint,
    data: { maxDaysInPool?: number; autoLabelIds?: bigint[]; isActive?: boolean },
  ) {
    await this.getById(id);
    const config = await this.prisma.recallConfig.update({
      where: { id },
      data,
      include: { creator: { select: { id: true, name: true } } },
    });
    return { data: config };
  }

  async remove(id: bigint) {
    await this.getById(id);
    await this.prisma.recallConfig.delete({ where: { id } });
    return { data: { success: true } };
  }

  @Cron('0 */2 * * *')
  async runAutoRecall() {
    try {
      this.logger.log('Bắt đầu chạy auto-recall...');
      const configs = await this.prisma.recallConfig.findMany({ where: { isActive: true } });

      let totalRecalled = 0;

      for (const config of configs) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - config.maxDaysInPool);

        if (config.entityType === 'LEAD') {
          totalRecalled += await this._recallLeads(config, cutoffDate);
        } else if (config.entityType === 'CUSTOMER') {
          totalRecalled += await this._recallCustomers(config, cutoffDate);
        }
      }

      this.logger.log(`Auto-recall hoàn thành. Tổng số entities đã thu hồi: ${totalRecalled}`);
      return { recalled: totalRecalled };
    } catch (error) {
      this.logger.error('Lỗi khi chạy auto-recall', error instanceof Error ? error.stack : error);
      return { recalled: 0, error: true };
    }
  }

  private async _recallLeads(
    config: { id: bigint; maxDaysInPool: number; autoLabelIds: bigint[] },
    cutoffDate: Date,
  ): Promise<number> {
    // Process in chunks of 500 to avoid large IN clauses
    const CHUNK_SIZE = 500;
    let totalRecalled = 0;

    while (true) {
      const leads = await this.prisma.lead.findMany({
        where: {
          status: LeadStatus.POOL,
          departmentId: { not: null },
          assignedUserId: null,
          deletedAt: null,
          updatedAt: { lt: cutoffDate },
        },
        select: { id: true },
        take: CHUNK_SIZE,
      });

      if (leads.length === 0) break;

      const leadIds = leads.map((l) => l.id);

      await this.prisma.lead.updateMany({
        where: { id: { in: leadIds } },
        data: { status: LeadStatus.FLOATING, departmentId: null, assignedUserId: null },
      });

      if (config.autoLabelIds.length > 0) {
        const labelData = leadIds.flatMap((leadId) =>
          config.autoLabelIds.map((labelId) => ({ leadId, labelId })),
        );
        await this.prisma.leadLabel.createMany({ data: labelData, skipDuplicates: true });
      }

      totalRecalled += leads.length;
      if (leads.length < CHUNK_SIZE) break; // last chunk
    }

    if (totalRecalled > 0) this.logger.log(`Đã thu hồi ${totalRecalled} leads về kho thả nổi`);
    return totalRecalled;
  }

  private async _recallCustomers(
    config: { id: bigint; maxDaysInPool: number; autoLabelIds: bigint[] },
    cutoffDate: Date,
  ): Promise<number> {
    // Kho Phòng Ban: status=ACTIVE, assignedUserId = null, assignedDepartmentId != null
    // Process in chunks of 500
    const CHUNK_SIZE = 500;
    let totalRecalled = 0;

    while (true) {
      const customers = await this.prisma.customer.findMany({
        where: {
          status: CustomerStatus.ACTIVE,
          assignedDepartmentId: { not: null },
          assignedUserId: null,
          deletedAt: null,
          updatedAt: { lt: cutoffDate },
        },
        select: { id: true },
        take: CHUNK_SIZE,
      });

      if (customers.length === 0) break;

      const customerIds = customers.map((c) => c.id);

      await this.prisma.customer.updateMany({
        where: { id: { in: customerIds } },
        data: { status: CustomerStatus.FLOATING, assignedDepartmentId: null, assignedUserId: null },
      });

      if (config.autoLabelIds.length > 0) {
        const labelData = customerIds.flatMap((customerId) =>
          config.autoLabelIds.map((labelId) => ({ customerId, labelId })),
        );
        await this.prisma.customerLabel.createMany({ data: labelData, skipDuplicates: true });
      }

      totalRecalled += customers.length;
      if (customers.length < CHUNK_SIZE) break;
    }

    if (totalRecalled > 0) this.logger.log(`Đã thu hồi ${totalRecalled} customers về kho thả nổi`);
    return totalRecalled;
  }
}
