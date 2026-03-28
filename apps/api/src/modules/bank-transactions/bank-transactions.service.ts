import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { PaymentMatchingService } from '../payments/payment-matching.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const BANK_TX_SELECT = {
  id: true, externalId: true, amount: true, content: true,
  bankAccount: true, senderName: true, senderAccount: true,
  transactionTime: true, matchedPaymentId: true, matchStatus: true,
  createdAt: true,
  matchedPayment: { select: { id: true, orderId: true, amount: true, status: true } },
} satisfies Prisma.BankTransactionSelect;

@Injectable()
export class BankTransactionsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly matchingService: PaymentMatchingService,
  ) {}

  async list(query: PaginationQueryDto & { matchStatus?: string }) {
    const limit = query.limit ?? 20;
    const where: Prisma.BankTransactionWhereInput = {};
    if (query.matchStatus) where.matchStatus = query.matchStatus as any;

    const txs = await this.prisma.bankTransaction.findMany({
      where, select: BANK_TX_SELECT, orderBy: { id: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: BigInt(query.cursor) } } : {}),
    });

    const hasMore = txs.length > limit;
    const data = hasMore ? txs.slice(0, limit) : txs;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  async listUnmatched(limit = 20, cursor?: string) {
    return this.list({ limit, cursor, matchStatus: 'UNMATCHED' });
  }

  /** Ingest bank transaction from webhook. Dedup by externalId. */
  async ingest(data: {
    externalId: string; amount: number; content: string;
    bankAccount?: string; senderName?: string; senderAccount?: string;
    transactionTime: string; rawData?: Record<string, unknown>;
  }) {
    if (!data.amount || data.amount <= 0) {
      throw new BadRequestException('Số tiền giao dịch phải lớn hơn 0');
    }

    // Dedup check
    const existing = await this.prisma.bankTransaction.findUnique({
      where: { externalId: data.externalId },
    });
    if (existing) throw new ConflictException('Giao dịch đã tồn tại (trùng external_id)');

    const bankTx = await this.prisma.bankTransaction.create({
      data: {
        externalId: data.externalId,
        amount: data.amount,
        content: data.content,
        bankAccount: data.bankAccount,
        senderName: data.senderName,
        senderAccount: data.senderAccount,
        transactionTime: new Date(data.transactionTime),
        rawData: data.rawData as any ?? undefined,
      },
      select: BANK_TX_SELECT,
    });

    // Try auto-match with pending payments
    await this.matchingService.tryMatchBankTransaction(bankTx.id);

    return this.prisma.bankTransaction.findUnique({
      where: { id: bankTx.id }, select: BANK_TX_SELECT,
    });
  }

  /** Manual match: link bank transaction to payment. */
  async manualMatch(bankTxId: bigint, paymentId: bigint, userId: bigint) {
    const bankTx = await this.prisma.bankTransaction.findFirst({
      where: { id: bankTxId, matchStatus: 'UNMATCHED' },
    });
    if (!bankTx) throw new NotFoundException('Giao dịch không tìm thấy hoặc đã được ghép');

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, status: 'PENDING' },
    });
    if (!payment) throw new NotFoundException('Thanh toán không tìm thấy hoặc không ở trạng thái PENDING');

    return this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'VERIFIED', verifiedBy: userId, verifiedAt: new Date(),
          verifiedSource: 'MANUAL', matchedTransaction: { connect: { id: bankTxId } },
        },
      });

      await tx.bankTransaction.update({
        where: { id: bankTxId },
        data: { matchedPaymentId: paymentId, matchStatus: 'MANUALLY_MATCHED' },
      });

      await this.matchingService.checkConversionTrigger(tx, paymentId);

      return { bankTxId, paymentId, status: 'MANUALLY_MATCHED' };
    });
  }
}
