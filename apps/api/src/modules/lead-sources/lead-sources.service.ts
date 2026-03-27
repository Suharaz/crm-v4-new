import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class LeadSourcesService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    const data = await this.prisma.leadSource.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return { data };
  }

  async create(data: { name: string; description?: string }) {
    return this.prisma.leadSource.create({ data });
  }

  async update(id: bigint, data: { name?: string; description?: string; isActive?: boolean }) {
    const source = await this.prisma.leadSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Không tìm thấy nguồn lead');
    return this.prisma.leadSource.update({ where: { id }, data });
  }

  async deactivate(id: bigint) {
    const source = await this.prisma.leadSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Không tìm thấy nguồn lead');
    return this.prisma.leadSource.update({ where: { id }, data: { isActive: false } });
  }
}
