import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const PRODUCT_SELECT = {
  id: true, name: true, price: true, description: true,
  categoryId: true, vatRate: true, isActive: true,
  createdAt: true, updatedAt: true,
  category: { select: { id: true, name: true } },
} satisfies Prisma.ProductSelect;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: PaginationQueryDto & { search?: string; includeInactive?: string }) {
    const limit = query.limit ?? 20;
    const where: Prisma.ProductWhereInput = { deletedAt: null };
    if (query.includeInactive !== 'true') where.isActive = true;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const products = await this.prisma.product.findMany({
      where, select: PRODUCT_SELECT,
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: BigInt(query.cursor) } } : {}),
    });

    const hasMore = products.length > limit;
    const data = hasMore ? products.slice(0, limit) : products;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  async findById(id: bigint) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null }, select: PRODUCT_SELECT,
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    return product;
  }

  async create(data: { name: string; price: number; description?: string; categoryId?: string; vatRate?: number }) {
    return this.prisma.product.create({
      data: {
        name: data.name,
        price: data.price,
        description: data.description,
        vatRate: data.vatRate ?? 0,
        ...(data.categoryId ? { category: { connect: { id: BigInt(data.categoryId) } } } : {}),
      },
      select: PRODUCT_SELECT,
    });
  }

  async update(id: bigint, data: { name?: string; price?: number; description?: string; categoryId?: string; vatRate?: number; isActive?: boolean }) {
    await this.findById(id);
    const updateData: Prisma.ProductUpdateInput = {};
    if (data.name) updateData.name = data.name;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.vatRate !== undefined) updateData.vatRate = data.vatRate;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.categoryId !== undefined) {
      updateData.category = data.categoryId
        ? { connect: { id: BigInt(data.categoryId) } }
        : { disconnect: true };
    }
    return this.prisma.product.update({ where: { id }, data: updateData, select: PRODUCT_SELECT });
  }

  async softDelete(id: bigint) {
    await this.findById(id);
    return this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
