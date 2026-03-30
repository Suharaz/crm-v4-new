import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaClient, Prisma, OrderStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

const ORDER_SELECT = {
  id: true, leadId: true, customerId: true, productId: true,
  amount: true, vatRate: true, vatAmount: true, totalAmount: true,
  status: true, notes: true, createdBy: true,
  createdAt: true, updatedAt: true,
  lead: { select: { id: true, name: true, phone: true, status: true } },
  customer: { select: { id: true, name: true, phone: true } },
  product: { select: { id: true, name: true, price: true } },
  creator: { select: { id: true, name: true } },
  payments: {
    select: {
      id: true, amount: true, status: true, transferContent: true,
      verifiedSource: true, verifiedAt: true, createdAt: true,
      paymentType: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.OrderSelect;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: PaginationQueryDto & { status?: OrderStatus; customerId?: string; leadId?: string }) {
    const limit = query.limit ?? 20;
    const where: Prisma.OrderWhereInput = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = BigInt(query.customerId);
    if (query.leadId) where.leadId = BigInt(query.leadId);

    const orders = await this.prisma.order.findMany({
      where, select: ORDER_SELECT, orderBy: { id: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: BigInt(query.cursor) } } : {}),
    });

    const hasMore = orders.length > limit;
    const data = hasMore ? orders.slice(0, limit) : orders;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  async findById(id: bigint) {
    const order = await this.prisma.order.findFirst({
      where: { id, deletedAt: null }, select: ORDER_SELECT,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    return order;
  }

  async create(data: {
    leadId?: string; customerId?: string; productId?: string;
    amount: number; notes?: string;
  }, userId: bigint) {
    // Get product VAT rate if productId provided
    let vatRate = 0;
    if (data.productId) {
      const product = await this.prisma.product.findFirst({
        where: { id: BigInt(data.productId), deletedAt: null, isActive: true },
      });
      if (!product) throw new NotFoundException('Sản phẩm không tồn tại');
      vatRate = Number(product.vatRate);
    }

    // Auto-create customer from lead if no customerId
    let customerId = data.customerId ? BigInt(data.customerId) : null;
    if (!customerId && data.leadId) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: BigInt(data.leadId), deletedAt: null },
        select: { id: true, phone: true, name: true, email: true, customerId: true, assignedUserId: true, departmentId: true },
      });
      if (!lead) throw new NotFoundException('Lead không tồn tại');

      if (lead.customerId) {
        customerId = lead.customerId;
      } else {
        // Create customer from lead data
        const customer = await this.prisma.customer.create({
          data: {
            phone: lead.phone, name: lead.name, email: lead.email,
            assignedUserId: lead.assignedUserId, assignedDepartmentId: lead.departmentId,
          },
        });
        customerId = customer.id;
        // Link customer to lead
        await this.prisma.lead.update({ where: { id: lead.id }, data: { customerId: customer.id } });
      }
    }

    if (!customerId) throw new BadRequestException('Cần customerId hoặc leadId để tạo đơn hàng');

    const amount = data.amount;
    const vatAmount = Math.round(amount * vatRate / 100);
    const totalAmount = amount + vatAmount;

    const order = await this.prisma.order.create({
      data: {
        amount, vatRate, vatAmount, totalAmount,
        notes: data.notes,
        customer: { connect: { id: customerId } },
        creator: { connect: { id: userId } },
        ...(data.leadId ? { lead: { connect: { id: BigInt(data.leadId) } } } : {}),
        ...(data.productId ? { product: { connect: { id: BigInt(data.productId) } } } : {}),
      },
      select: ORDER_SELECT,
    });

    // Auto-trigger IN_PROGRESS on lead if ASSIGNED
    if (data.leadId) {
      await this.triggerLeadInProgress(BigInt(data.leadId), userId);
    }

    return order;
  }

  async updateStatus(id: bigint, newStatus: OrderStatus) {
    const order = await this.findById(id);
    const current = order.status as OrderStatus;

    if (!ALLOWED_ORDER_TRANSITIONS[current]?.includes(newStatus)) {
      throw new ConflictException(`Không thể chuyển từ ${current} sang ${newStatus}`);
    }

    return this.prisma.order.update({
      where: { id }, data: { status: newStatus }, select: ORDER_SELECT,
    });
  }

  async softDelete(id: bigint) {
    const order = await this.findById(id);
    if (order.status !== 'PENDING') {
      throw new ConflictException('Chỉ xóa đơn hàng PENDING');
    }
    return this.prisma.order.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private async triggerLeadInProgress(leadId: bigint, userId: bigint) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, status: 'ASSIGNED', deletedAt: null },
    });
    if (!lead) return;

    await this.prisma.lead.update({ where: { id: leadId }, data: { status: 'IN_PROGRESS' } });
    await this.prisma.activity.create({
      data: {
        entityType: 'LEAD', entityId: leadId, userId,
        type: 'STATUS_CHANGE',
        content: 'ASSIGNED → IN_PROGRESS (tự động khi tạo đơn hàng)',
        metadata: { fromStatus: 'ASSIGNED', toStatus: 'IN_PROGRESS', auto: true },
      },
    });
  }
}
