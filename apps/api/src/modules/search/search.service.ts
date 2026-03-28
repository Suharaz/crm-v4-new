import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Global search across leads, customers, orders. */
  async search(query: string, limit = 10) {
    const [leads, customers, orders] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, phone: true, status: true },
        take: limit,
      }),
      this.prisma.customer.findMany({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, phone: true, status: true },
        take: limit,
      }),
      this.prisma.order.findMany({
        where: {
          deletedAt: null,
          customer: {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { phone: { contains: query } },
            ],
          },
        },
        select: { id: true, totalAmount: true, status: true, customer: { select: { name: true } } },
        take: limit,
      }),
    ]);

    return { leads, customers, orders };
  }
}
