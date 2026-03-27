import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class EmployeeLevelsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    const data = await this.prisma.employeeLevel.findMany({
      where: { deletedAt: null },
      orderBy: { rank: 'asc' },
    });
    return { data };
  }

  async findById(id: bigint) {
    const level = await this.prisma.employeeLevel.findFirst({
      where: { id, deletedAt: null },
    });
    if (!level) throw new NotFoundException('Không tìm thấy cấp bậc');
    return level;
  }

  async create(data: { name: string; rank: number }) {
    return this.prisma.employeeLevel.create({ data });
  }

  async update(id: bigint, data: { name?: string; rank?: number }) {
    await this.findById(id);
    return this.prisma.employeeLevel.update({ where: { id }, data });
  }

  async delete(id: bigint) {
    await this.findById(id);
    return this.prisma.employeeLevel.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
