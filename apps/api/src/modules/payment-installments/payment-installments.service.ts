import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PaymentInstallmentsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    const data = await this.prisma.paymentInstallment.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
    return { data };
  }

  async create(data: { name: string }) {
    return this.prisma.paymentInstallment.create({ data });
  }

  async update(id: bigint, data: { name?: string; isActive?: boolean }) {
    const record = await this.prisma.paymentInstallment.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Không tìm thấy đợt thanh toán');
    return this.prisma.paymentInstallment.update({ where: { id }, data });
  }

  async deactivate(id: bigint) {
    return this.prisma.paymentInstallment.update({ where: { id }, data: { isActive: false } });
  }
}
