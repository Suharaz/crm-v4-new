import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PaymentTypesService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    const data = await this.prisma.paymentType.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
    return { data };
  }

  async create(data: { name: string; description?: string }) {
    return this.prisma.paymentType.create({ data });
  }

  async update(id: bigint, data: { name?: string; description?: string; isActive?: boolean }) {
    const pt = await this.prisma.paymentType.findUnique({ where: { id } });
    if (!pt) throw new NotFoundException('Không tìm thấy loại thanh toán');
    return this.prisma.paymentType.update({ where: { id }, data });
  }

  async deactivate(id: bigint) {
    return this.prisma.paymentType.update({ where: { id }, data: { isActive: false } });
  }
}
