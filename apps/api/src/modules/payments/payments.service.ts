import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaClient, Prisma, PaymentStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PaymentMatchingService } from './payment-matching.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const PAYMENT_SELECT = {
  id: true, orderId: true, paymentTypeId: true, bankAccountId: true, amount: true,
  status: true, transferContent: true, verifiedSource: true,
  verifiedBy: true, verifiedAt: true, createdAt: true, updatedAt: true,
  vatAmount: true, transferDate: true, installmentId: true,
  paymentType: { select: { id: true, name: true } },
  bankAccount: { select: { id: true, name: true } },
  verifier: { select: { id: true, name: true } },
  matchedTransaction: { select: { id: true, externalId: true, amount: true, content: true, transactionTime: true } },
  installment: { select: { id: true, name: true } },
  order: {
    select: {
      id: true, status: true, totalAmount: true, vatEmail: true,
      companyName: true, taxCode: true, contactPerson: true, address: true,
      format: true, stt: true, courseCode: true, notes: true,
      customer: { select: { id: true, name: true, phone: true } },
      product: { select: { id: true, name: true } },
      productGroup: { select: { id: true, name: true } },
      orderFormat: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      lead: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.PaymentSelect;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly matchingService: PaymentMatchingService,
  ) {}

  async list(query: PaginationQueryDto & {
    status?: PaymentStatus; orderId?: string;
    paymentTypeId?: string; search?: string; dateFrom?: string; dateTo?: string;
  }) {
    const limit = query.limit ?? 20;
    const where: Prisma.PaymentWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.orderId) where.orderId = BigInt(query.orderId);
    if (query.paymentTypeId) where.paymentTypeId = BigInt(query.paymentTypeId);
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo + 'T23:59:59.999Z') } : {}),
      };
    }
    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { transferContent: { contains: term, mode: 'insensitive' } },
        { order: { customer: { name: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    // Offset-based pagination when page is provided
    if (query.page) {
      const page = query.page;
      const skip = (page - 1) * limit;
      const [payments, total] = await Promise.all([
        this.prisma.payment.findMany({ where, select: PAYMENT_SELECT, orderBy: { id: 'desc' }, skip, take: limit }),
        this.prisma.payment.count({ where }),
      ]);
      return { data: payments, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    // Cursor-based pagination (default)
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

  async create(data: {
    orderId: string; amount: number; paymentTypeId?: string; bankAccountId?: string; transferContent?: string;
    transferDate?: Date; vatAmount?: number; installmentId?: bigint;
  }) {
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
        ...(data.transferDate ? { transferDate: data.transferDate } : {}),
        ...(data.vatAmount !== undefined ? { vatAmount: data.vatAmount } : {}),
        ...(data.paymentTypeId ? { paymentType: { connect: { id: BigInt(data.paymentTypeId) } } } : {}),
        ...(data.bankAccountId ? { bankAccount: { connect: { id: BigInt(data.bankAccountId) } } } : {}),
        ...(data.installmentId ? { installment: { connect: { id: data.installmentId } } } : {}),
      },
      select: PAYMENT_SELECT,
    });

    // Try auto-match with bank transactions
    if (data.transferContent) {
      await this.matchingService.tryMatchPayment(payment.id);
    }

    // Log activity on lead timeline
    if (order.leadId) {
      await this.prisma.activity.create({
        data: {
          entityType: 'LEAD', entityId: order.leadId, userId: order.createdBy,
          type: 'NOTE',
          content: `Thanh toán ${data.amount.toLocaleString('vi-VN')}₫ — ${data.transferContent || 'CK'} (chờ xác nhận)`,
          metadata: { paymentId: payment.id.toString(), type: 'PAYMENT_CREATED' },
        },
      });
    }

    return this.findById(payment.id);
  }

  async verifyManual(id: bigint, userId: bigint, bankTransactionId?: string) {
    await this.prisma.$transaction(async (tx) => {
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

      // Log verified activity on lead
      const order = await tx.order.findFirst({ where: { id: payment.orderId }, select: { leadId: true } });
      if (order?.leadId) {
        await tx.activity.create({
          data: {
            entityType: 'LEAD', entityId: order.leadId, userId,
            type: 'NOTE',
            content: `Xác nhận thanh toán ${Number(payment.amount).toLocaleString('vi-VN')}₫ ✅`,
            metadata: { paymentId: id.toString(), type: 'PAYMENT_VERIFIED' },
          },
        });
      }
    });

    // Read after transaction commits to return up-to-date status
    return this.findById(id);
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

  async exportVerified(dateFrom?: string, dateTo?: string): Promise<Buffer> {
    const where: Prisma.PaymentWhereInput = { status: 'VERIFIED' };
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59.999Z') } : {}),
      };
    }

    const payments = await this.prisma.payment.findMany({
      where,
      select: PAYMENT_SELECT,
      orderBy: { id: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Hoá đơn đã xác minh');

    const formatDate = (d: Date | string | null | undefined): string => {
      if (!d) return '';
      const dt = new Date(d);
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yyyy = dt.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };

    const headers = [
      '#', 'Số tiền', 'Tiền VAT', 'Loại CK', 'Lần CK', 'Nội dung CK', 'Ngày CK',
      'Khách hàng', 'SĐT', 'Sản phẩm', 'Tên công ty', 'MST', 'Người liên hệ',
      'Địa chỉ', 'Mail VAT', 'Hình thức', 'Nhóm SP', 'STT', 'Mã khoá',
      'Ghi chú', 'Nguồn xác minh', 'Người xác nhận', 'Ngày xác nhận',
    ];

    sheet.addRow(headers);

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Data rows
    payments.forEach((p, idx) => {
      const o = p.order;
      sheet.addRow([
        idx + 1,
        Number(p.amount),
        p.vatAmount != null ? Number(p.vatAmount) : '',
        p.paymentType?.name ?? '',
        p.installment?.name ?? '',
        p.transferContent ?? '',
        formatDate(p.transferDate),
        o?.customer?.name ?? '',
        o?.customer?.phone ?? '',
        o?.product?.name ?? '',
        o?.companyName ?? '',
        o?.taxCode ?? '',
        o?.contactPerson ?? '',
        o?.address ?? '',
        o?.vatEmail ?? '',
        o?.orderFormat?.name ?? o?.format ?? '',
        o?.productGroup?.name ?? '',
        o?.stt ?? '',
        o?.courseCode ?? '',
        o?.notes ?? '',
        p.verifiedSource === 'AUTO' ? 'Auto' : 'Thủ công',
        p.verifier?.name ?? '',
        formatDate(p.verifiedAt),
      ]);
    });

    // Format amount columns (B = col 2, C = col 3)
    [2, 3].forEach((col) => {
      sheet.getColumn(col).numFmt = '#,##0';
    });

    // Auto column widths
    sheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = cell.value != null ? String(cell.value).length : 0;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.min(maxLen + 2, 40);
    });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
