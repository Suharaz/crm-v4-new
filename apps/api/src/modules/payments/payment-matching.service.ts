import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Auto-match logic between payments and bank transactions.
 * Exact match: amount === bankTx.amount AND content substring match.
 * Only match if exactly 1 candidate (ambiguous → skip for manager).
 */
@Injectable()
export class PaymentMatchingService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Try to match a PENDING payment with an UNMATCHED bank transaction. */
  async tryMatchPayment(paymentId: bigint) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.status !== 'PENDING' || !payment.transferContent) return null;

    const candidates = await this.prisma.bankTransaction.findMany({
      where: {
        matchStatus: 'UNMATCHED',
        amount: payment.amount,
        content: { contains: payment.transferContent, mode: 'insensitive' },
      },
    });

    // Only auto-match if exactly 1 candidate
    if (candidates.length !== 1) return null;

    return this.executeMatch(paymentId, candidates[0].id);
  }

  /** Try to match an UNMATCHED bank transaction with a PENDING payment. */
  async tryMatchBankTransaction(bankTxId: bigint) {
    const bankTx = await this.prisma.bankTransaction.findUnique({ where: { id: bankTxId } });
    if (!bankTx || bankTx.matchStatus !== 'UNMATCHED') return null;

    const candidates = await this.prisma.payment.findMany({
      where: {
        status: 'PENDING',
        amount: bankTx.amount,
        transferContent: { not: null },
      },
    });

    // Filter by content match
    const matching = candidates.filter(
      (p) => p.transferContent && bankTx.content.toLowerCase().includes(p.transferContent.toLowerCase()),
    );

    if (matching.length !== 1) return null;

    return this.executeMatch(matching[0].id, bankTxId);
  }

  /** Execute the match: verify payment + update bank transaction in transaction. */
  private async executeMatch(paymentId: bigint, bankTxId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      // Optimistic guard: only match if bank transaction is still UNMATCHED
      const bankTxClaimed = await tx.bankTransaction.updateMany({
        where: { id: bankTxId, matchStatus: 'UNMATCHED' },
        data: { matchedPaymentId: paymentId, matchStatus: 'AUTO_MATCHED' },
      });
      if (bankTxClaimed.count === 0) return null; // already matched by concurrent request

      // Optimistic guard: only verify if payment is still PENDING
      const paymentClaimed = await tx.payment.updateMany({
        where: { id: paymentId, status: 'PENDING' },
        data: {
          status: 'VERIFIED',
          verifiedSource: 'AUTO',
          verifiedAt: new Date(),
        },
      });
      if (paymentClaimed.count === 0) {
        // Rollback bank transaction claim
        await tx.bankTransaction.update({
          where: { id: bankTxId },
          data: { matchedPaymentId: null, matchStatus: 'UNMATCHED' },
        });
        return null;
      }

      // Check conversion trigger
      await this.checkConversionTrigger(tx, paymentId);

      return { paymentId, bankTxId, status: 'AUTO_MATCHED' };
    });
  }

  /** Check if all payments for the order are verified → trigger lead conversion. */
  async checkConversionTrigger(tx: any, paymentId: bigint) {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { order: { select: { id: true, totalAmount: true, leadId: true } } },
    });
    if (!payment?.order) return;

    // Sum verified payments for this order
    const result = await tx.payment.aggregate({
      where: { orderId: payment.orderId, status: 'VERIFIED' },
      _sum: { amount: true },
    });

    const totalVerified = Number(result._sum.amount || 0);
    const orderTotal = Number(payment.order.totalAmount);

    if (totalVerified >= orderTotal) {
      // Auto-complete order when fully paid
      await tx.order.update({
        where: { id: payment.orderId },
        data: { status: 'COMPLETED' },
      });

      // Trigger lead conversion if linked
      if (!payment.order.leadId) return;
      const lead = await tx.lead.findFirst({
        where: { id: payment.order.leadId, deletedAt: null },
      });
      if (lead && lead.status !== 'CONVERTED') {
        await tx.lead.update({ where: { id: lead.id }, data: { status: 'CONVERTED' } });

        // Update customer
        if (lead.customerId) {
          await tx.customer.update({
            where: { id: lead.customerId },
            data: { status: 'ACTIVE', assignedUserId: lead.assignedUserId, assignedDepartmentId: lead.departmentId },
          });
        }

        await tx.activity.create({
          data: {
            entityType: 'LEAD', entityId: lead.id,
            userId: payment.verifiedBy || lead.assignedUserId || BigInt(1),
            type: 'STATUS_CHANGE',
            content: 'Chuyển đổi tự động: thanh toán đủ',
            metadata: { fromStatus: lead.status, toStatus: 'CONVERTED', totalVerified, orderTotal },
          },
        });
      }
    }
  }
}
