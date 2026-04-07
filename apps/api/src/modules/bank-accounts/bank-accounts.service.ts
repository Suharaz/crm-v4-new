import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class BankAccountsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    const data = await this.prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
    return { data };
  }

  async create(data: { name: string }) {
    return this.prisma.bankAccount.create({ data });
  }

  async update(id: bigint, data: { name?: string; isActive?: boolean }) {
    const ba = await this.prisma.bankAccount.findUnique({ where: { id } });
    if (!ba) throw new NotFoundException('Không tìm thấy tài khoản ngân hàng');
    return this.prisma.bankAccount.update({ where: { id }, data });
  }

  async deactivate(id: bigint) {
    return this.prisma.bankAccount.update({ where: { id }, data: { isActive: false } });
  }
}
