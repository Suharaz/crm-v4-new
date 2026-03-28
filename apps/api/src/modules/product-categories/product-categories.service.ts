import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class ProductCategoriesService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    const data = await this.prisma.productCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return { data };
  }

  async create(data: { name: string; description?: string }) {
    return this.prisma.productCategory.create({ data });
  }

  async update(id: bigint, data: { name?: string; description?: string; isActive?: boolean }) {
    const cat = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Không tìm thấy danh mục');
    return this.prisma.productCategory.update({ where: { id }, data });
  }

  async deactivate(id: bigint) {
    return this.prisma.productCategory.update({ where: { id }, data: { isActive: false } });
  }
}
