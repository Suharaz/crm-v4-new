import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class ProductGroupsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    const data = await this.prisma.productGroup.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
    return { data };
  }

  async create(data: { name: string }) {
    return this.prisma.productGroup.create({ data });
  }

  async update(id: bigint, data: { name?: string; isActive?: boolean }) {
    const record = await this.prisma.productGroup.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Không tìm thấy nhóm sản phẩm');
    return this.prisma.productGroup.update({ where: { id }, data });
  }

  async deactivate(id: bigint) {
    return this.prisma.productGroup.update({ where: { id }, data: { isActive: false } });
  }
}
