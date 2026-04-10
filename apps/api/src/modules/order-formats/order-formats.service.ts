import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class OrderFormatsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    const data = await this.prisma.orderFormat.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
    return { data };
  }

  async create(data: { name: string }) {
    return this.prisma.orderFormat.create({ data });
  }

  async update(id: bigint, data: { name?: string; isActive?: boolean }) {
    const record = await this.prisma.orderFormat.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Không tìm thấy định dạng đơn hàng');
    return this.prisma.orderFormat.update({ where: { id }, data });
  }

  async deactivate(id: bigint) {
    return this.prisma.orderFormat.update({ where: { id }, data: { isActive: false } });
  }
}
