import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { normalizePhone, isValidVNPhone } from '@crm/utils';
import { PaymentMatchingService } from './payment-matching.service';

// Column header → field name mapping (Vietnamese headers)
const HEADER_MAP: Record<string, string> = {
  'sđt': 'phone',
  'số điện thoại': 'phone',
  'tên khách hàng': 'customerName',
  'tên kh': 'customerName',
  'sản phẩm': 'productName',
  'sp': 'productName',
  'số tiền': 'amount',
  'ngày ck': 'transferDate',
  'nội dung ck': 'transferContent',
  'hình thức ck': 'paymentTypeName',
  'loại ck': 'paymentTypeName',
  'lần ck': 'installmentName',
  'user': 'userEmail',
  'email': 'userEmail',
  'tên công ty': 'companyName',
  'mst': 'taxCode',
  'người liên hệ': 'contactPerson',
  'địa chỉ': 'address',
  'mail vat': 'vatEmail',
  'email vat': 'vatEmail',
  'hình thức': 'orderFormatName',
  'nhóm sp': 'productGroupName',
  'nhóm sản phẩm': 'productGroupName',
  'stt': 'stt',
  'mã khoá': 'courseCode',
  'mã khóa': 'courseCode',
  'ghi chú': 'notes',
};

export interface ImportRowResult {
  row: number;
  phone: string;
  reason: string;
}

export interface ImportResult {
  total: number;
  created: number;
  matched: number;
  newCustomers: number;
  newOrders: number;
  errors: ImportRowResult[];
}

interface RowData {
  phone: string;
  customerName: string;
  productName: string;
  amount: number;
  transferDate?: Date;
  transferContent?: string;
  paymentTypeName?: string;
  installmentName?: string;
  userEmail?: string;
  companyName?: string;
  taxCode?: string;
  contactPerson?: string;
  address?: string;
  vatEmail?: string;
  orderFormatName?: string;
  productGroupName?: string;
  stt?: string;
  courseCode?: string;
  notes?: string;
}

@Injectable()
export class PaymentImportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly matchingService: PaymentMatchingService,
  ) {}

  async importFromExcel(buffer: Buffer, uploaderId: bigint): Promise<ImportResult> {
    const workbook = new ExcelJS.Workbook();
    // Cast needed: Node 22 Buffer<ArrayBufferLike> vs exceljs's Buffer typedef mismatch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('File Excel không có dữ liệu');

    // Parse headers from row 1
    const headerRow = sheet.getRow(1);
    const colMap: Record<number, string> = {};
    headerRow.eachCell((cell, colNum) => {
      const raw = String(cell.value ?? '').trim().toLowerCase();
      const field = HEADER_MAP[raw];
      if (field) colMap[colNum] = field;
    });

    // Preload lookup tables once
    const [paymentTypes, installments, orderFormats, productGroups] = await Promise.all([
      this.prisma.paymentType.findMany({ select: { id: true, name: true } }),
      this.prisma.paymentInstallment.findMany({ select: { id: true, name: true } }),
      this.prisma.orderFormat.findMany({ select: { id: true, name: true } }),
      this.prisma.productGroup.findMany({ select: { id: true, name: true } }),
    ]);

    const result: ImportResult = { total: 0, created: 0, matched: 0, newCustomers: 0, newOrders: 0, errors: [] };

    const rows: { rowNum: number; data: RowData }[] = [];

    // Parse all data rows (skip header row 1)
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header

      // Check if row is empty
      let hasData = false;
      row.eachCell((cell) => {
        if (cell.value !== null && cell.value !== undefined && String(cell.value).trim() !== '') {
          hasData = true;
        }
      });
      if (!hasData) return;

      const rowData: Partial<RowData> = {};
      row.eachCell((cell, colNum) => {
        const field = colMap[colNum];
        if (!field) return;
        const val = cell.value;
        if (val === null || val === undefined) return;

        if (field === 'transferDate') {
          if (val instanceof Date) {
            rowData.transferDate = val;
          } else {
            const parsed = new Date(String(val));
            if (!isNaN(parsed.getTime())) rowData.transferDate = parsed;
          }
        } else if (field === 'amount') {
          const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^\d.-]/g, ''));
          if (!isNaN(num)) rowData.amount = num;
        } else {
          (rowData as any)[field] = String(val).trim();
        }
      });

      rows.push({ rowNum, data: rowData as RowData });
    });

    result.total = rows.length;

    // Process each row
    for (const { rowNum, data } of rows) {
      try {
        await this._processRow(data, rowNum, uploaderId, paymentTypes, installments, orderFormats, productGroups, result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
        result.errors.push({ row: rowNum, phone: data.phone ?? '', reason: msg });
      }
    }

    return result;
  }

  private async _processRow(
    data: RowData,
    rowNum: number,
    uploaderId: bigint,
    paymentTypes: { id: bigint; name: string }[],
    installments: { id: bigint; name: string }[],
    orderFormats: { id: bigint; name: string }[],
    productGroups: { id: bigint; name: string }[],
    result: ImportResult,
  ): Promise<void> {
    // Validate required fields
    if (!data.phone) throw new Error('Thiếu SĐT');
    if (!data.customerName) throw new Error('Thiếu tên khách hàng');
    if (!data.productName) throw new Error('Thiếu sản phẩm');
    if (!data.amount || data.amount <= 0) throw new Error('Số tiền không hợp lệ');

    // Normalize & validate phone
    const phone = normalizePhone(data.phone);
    if (!phone || !isValidVNPhone(phone)) throw new Error(`SĐT không hợp lệ: ${data.phone}`);

    // Find product (case-insensitive)
    const product = await this.prisma.product.findFirst({
      where: { name: { equals: data.productName, mode: 'insensitive' }, deletedAt: null },
      select: { id: true, name: true, price: true, vatRate: true },
    });
    if (!product) throw new Error(`Không tìm thấy sản phẩm: "${data.productName}"`);

    // Resolve lookup IDs
    const paymentTypeId = data.paymentTypeName
      ? this._findByName(paymentTypes, data.paymentTypeName)
      : undefined;
    const installmentId = data.installmentName
      ? this._findByName(installments, data.installmentName)
      : undefined;
    const orderFormatId = data.orderFormatName
      ? this._findByName(orderFormats, data.orderFormatName)
      : undefined;
    const productGroupId = data.productGroupName
      ? this._findByName(productGroups, data.productGroupName)
      : undefined;

    // Resolve creator
    let creatorId = uploaderId;
    if (data.userEmail) {
      const user = await this.prisma.user.findFirst({
        where: { email: data.userEmail, deletedAt: null },
        select: { id: true },
      });
      if (user) creatorId = user.id;
    }

    // Execute within transaction: find/create customer, find/create order, create payment
    const { paymentId, wasNewCustomer, wasNewOrder } = await this.prisma.$transaction(async (tx) => {
      // a. Find or create customer
      let customer = await tx.customer.findFirst({
        where: { phone, deletedAt: null },
        select: { id: true },
      });
      let wasNewCustomer = false;

      if (!customer) {
        // Try to find via lead
        const lead = await tx.lead.findFirst({
          where: { phone, deletedAt: null },
          select: { customerId: true },
        });
        if (lead?.customerId) {
          customer = await tx.customer.findFirst({
            where: { id: lead.customerId, deletedAt: null },
            select: { id: true },
          });
        }
      }

      if (!customer) {
        customer = await tx.customer.create({
          data: { phone, name: data.customerName },
          select: { id: true },
        });
        wasNewCustomer = true;
      }

      // b. Find or create order
      const existingOrder = await tx.order.findFirst({
        where: {
          customerId: customer.id,
          productId: product.id,
          status: { notIn: ['CANCELLED', 'REFUNDED'] },
          deletedAt: null,
        },
        orderBy: { id: 'desc' },
        select: { id: true, totalAmount: true },
      });

      let orderId: bigint;
      let wasNewOrder = false;

      if (existingOrder) {
        orderId = existingOrder.id;
      } else {
        const productPrice = Number(product.price);
        const vatRate = Number(product.vatRate);
        const vatAmount = Math.round((productPrice * vatRate) / 100);
        const totalAmount = productPrice + vatAmount;

        const newOrder = await tx.order.create({
          data: {
            customerId: customer.id,
            productId: product.id,
            amount: productPrice,
            vatRate,
            vatAmount,
            totalAmount,
            createdBy: creatorId,
            companyName: data.companyName || null,
            taxCode: data.taxCode || null,
            contactPerson: data.contactPerson || null,
            address: data.address || null,
            vatEmail: data.vatEmail || null,
            formatId: orderFormatId ?? null,
            productGroupId: productGroupId ?? null,
            stt: data.stt || null,
            courseCode: data.courseCode || null,
            notes: data.notes || null,
            customerName: data.customerName,
            customerPhone: phone,
          },
          select: { id: true },
        });
        orderId = newOrder.id;
        wasNewOrder = true;
      }

      // c. Create payment (PENDING)
      const vatAmount = Math.round((data.amount * Number(product.vatRate)) / 100);
      const payment = await tx.payment.create({
        data: {
          orderId,
          amount: data.amount,
          vatAmount,
          status: 'PENDING',
          transferContent: data.transferContent || null,
          transferDate: data.transferDate || null,
          paymentTypeId: paymentTypeId ?? null,
          installmentId: installmentId ?? null,
        },
        select: { id: true },
      });

      return { paymentId: payment.id, wasNewCustomer, wasNewOrder };
    });

    result.created++;
    if (wasNewCustomer) result.newCustomers++;
    if (wasNewOrder) result.newOrders++;

    // d. Try auto-match outside transaction
    if (data.transferContent) {
      try {
        const matchResult = await this.matchingService.tryMatchPayment(paymentId);
        if (matchResult) result.matched++;
      } catch {
        // Match failure is non-fatal
      }
    }
  }

  private _findByName(list: { id: bigint; name: string }[], name: string): bigint | undefined {
    const lower = name.toLowerCase().trim();
    const found = list.find((item) => item.name.toLowerCase().trim() === lower);
    return found?.id;
  }

  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Mẫu nhập payment');

    const headers = [
      'SĐT', 'Tên khách hàng', 'Sản phẩm', 'Số tiền',
      'Ngày CK', 'Nội dung CK', 'Hình thức CK', 'Lần CK', 'User',
      'Tên công ty', 'MST', 'Người liên hệ', 'Địa chỉ', 'Mail VAT',
      'Hình thức', 'Nhóm SP', 'STT', 'Mã khoá', 'Ghi chú',
    ];

    sheet.addRow(headers);

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add example row
    sheet.addRow([
      '0912345678', 'Nguyễn Văn A', 'Khoá học ABC', 5000000,
      new Date(), 'CK tháng 4', 'Chuyển khoản', 'CK Full', 'sale@example.com',
      '', '', '', '', '',
      '', '', '', '', '',
    ]);

    // Set column widths
    const widths = [15, 20, 25, 12, 12, 25, 15, 12, 25, 20, 15, 20, 25, 25, 15, 15, 10, 15, 20];
    headers.forEach((_, i) => {
      sheet.getColumn(i + 1).width = widths[i] ?? 15;
    });

    // Format amount column (D = col 4)
    sheet.getColumn(4).numFmt = '#,##0';

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
