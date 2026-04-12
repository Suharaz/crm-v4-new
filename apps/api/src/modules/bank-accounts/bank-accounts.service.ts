import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';

@Injectable()
export class BankAccountsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  async list() {
    return {
      data: await this.cacheService.getOrSet(
        CACHE_KEYS.LOOKUP_BANK_ACCOUNTS,
        CACHE_TTL.LOOKUP,
        () => this.prisma.bankAccount.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } }),
      ),
    };
  }

  async create(data: { name: string }) {
    const result = await this.prisma.bankAccount.create({ data });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_BANK_ACCOUNTS);
    return result;
  }

  async update(id: bigint, data: { name?: string; isActive?: boolean }) {
    const ba = await this.prisma.bankAccount.findUnique({ where: { id } });
    if (!ba) throw new NotFoundException('Không tìm thấy tài khoản ngân hàng');
    const result = await this.prisma.bankAccount.update({ where: { id }, data });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_BANK_ACCOUNTS);
    return result;
  }

  async deactivate(id: bigint) {
    const result = await this.prisma.bankAccount.update({ where: { id }, data: { isActive: false } });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_BANK_ACCOUNTS);
    return result;
  }
}
