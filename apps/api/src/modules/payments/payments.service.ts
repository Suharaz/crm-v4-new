import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaClient, Prisma, PaymentStatus } from '@prisma/client';
import { PaymentMatchingService } from './payment-matching.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const PAYMENT_SELECT = {
  id: true, orderId: true, paymentTypeId: true, amount: true,
  status: true, transferContent: true, verifiedSource: true,
  verifiedBy: true, verifiedAt: true, createdAt: true, updatedAt: true,
  paymentType: { select: { id: true, name: true } },
  verifier: { select: { id: true, name: true } },
  matchedTransaction: { select: { id: true, externalId: true, amount: true, content: true, transactionTime: true } },
} satisfies Prisma.PaymentSelect;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly matchingService: PaymentMatchingService,
  ) {}

  async list(query: PaginationQueryDto & { status?: PaymentStatus; orderId?: string }) {
    const limit = query.limit ?? 20;
    const where: Prisma.PaymentWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.orderId) where.orderId = BigInt(query.orderId);

    const payments = await this.prisma.payment.findMany({
      where, select: PAYMENT_SELECT, orderBy: { id: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: BigInt(query.cursor) } } : {}),
    });

    const hasMore = payments.length > limit;
    const data = hasMore ? payments.slice(0, limit) : payments;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  async findById(id: bigint) {
    const payment = await this.prisma.payment.findFirst({
      where: { id }, select: PAYMENT_SELECT,
    });
    if (!payment) throw new NotFoundException('Không tìm thấy thanh toán');
    return payment;
  }

  async listPending(limit = 20, cursor?: string) {
    return this.list({ limit, cursor, status: 'PENDING' });
  }

  async create(data: { orderId: string; amount: number; paymentTypeId?: string; transferContent?: string }) {
    const orderId = BigInt(data.orderId);
    const order = await this.prisma.order.findFirst({ where: { id: orderId, deletedAt: null } });
    if (!order) throw new NotFoundException('Đơn hàng không tồn tại');

    // Validate total payments don't exceed order amount
    const existing = await this.prisma.payment.aggregate({
      where: { orderId, status: { not: 'REJECTED' } },
      _sum: { amount: true },
    });
    const currentTotal = Number(existing._sum.amount || 0);
    if (currentTotal + data.amount > Number(order.totalAmount)) {
      throw new ConflictException('Tổng thanh toán vượt quá giá trị đơn hàng');
    }

    const payment = await this.prisma.payment.create({
      data: {
        order: { connect: { id: orderId } },
        amount: data.amount,
        transferContent: data.transferContent,
        ...(data.paymentTypeId ? { paymentType: { connect: { id: BigInt(data.paymentTypeId) } } } : {}),
      },
      select: PAYMENT_SELECT,
    });

    // Try auto-match with bank transactions
    if (data.transferContent) {
      await this.matchingService.tryMatchPayment(payment.id);
    }

    return this.findById(payment.id);
  }

  async verifyManual(id: bigint, userId: bigint, bankTransactionId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id, status: 'PENDING' } });
      if (!payment) throw new ConflictException('Thanh toán không ở trạng thái PENDING');

      const updateData: any = {
        status: 'VERIFIED',
        verifiedBy: userId,
        verifiedAt: new Date(),
        verifiedSource: 'MANUAL',
      };

      if (bankTransactionId) {
        const bankTxId = BigInt(bankTransactionId);
        updateData.matchedTransaction = { connect: { id: bankTxId } };
        await tx.bankTransaction.update({
          where: { id: bankTxId },
          data: { matchedPaymentId: id, matchStatus: 'MANUALLY_MATCHED' },
        });
      }

      await tx.payment.update({ where: { id }, data: updateData });

      // Check conversion trigger
      await this.matchingService.checkConversionTrigger(tx, id);

      return this.findById(id);
    });
  }

  async reject(id: bigint, userId: bigint) {
    const payment = await this.prisma.payment.findFirst({ where: { id, status: 'PENDING' } });
    if (!payment) throw new ConflictException('Thanh toán không ở trạng thái PENDING');

    return this.prisma.payment.update({
      where: { id },
      data: { status: 'REJECTED', verifiedBy: userId, verifiedAt: new Date(), verifiedSource: 'MANUAL' },
      select: PAYMENT_SELECT,
    });
  }
}
