import { Injectable } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

// Fields to never return in API responses
const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  departmentId: true,
  teamId: true,
  employeeLevelId: true,
  isLeader: true,
  status: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
  employeeLevel: { select: { id: true, name: true, rank: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findMany(params: {
    where?: Prisma.UserWhereInput;
    cursor?: bigint;
    limit?: number;
  }) {
    const { where = {}, cursor, limit = 20 } = params;
    const take = limit + 1; // fetch one extra for cursor

    const users = await this.prisma.user.findMany({
      where: { ...where, deletedAt: null },
      select: USER_SELECT,
      orderBy: { id: 'asc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const hasMore = users.length > limit;
    const data = hasMore ? users.slice(0, limit) : users;
    const nextCursor = hasMore ? data[data.length - 1].id : undefined;

    return { data, meta: { nextCursor: nextCursor?.toString() } };
  }

  async findById(id: bigint) {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_SELECT,
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
  }

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data, select: USER_SELECT });
  }

  async update(id: bigint, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({ where: { id }, data, select: USER_SELECT });
  }

  async softDelete(id: bigint) {
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
      select: USER_SELECT,
    });
  }
}
