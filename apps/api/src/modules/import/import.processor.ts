import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { normalizePhone, isValidVNPhone } from '@crm/utils';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';
import { ConfigService } from '@nestjs/config';

interface ImportJobData {
  importJobId: string;
  type: 'leads' | 'customers';
  filePath: string;
}

@Processor('import')
export class ImportProcessor extends WorkerHost {
  private readonly uploadDir: string;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    configService: ConfigService,
  ) {
    super();
    this.uploadDir = configService.get('UPLOAD_DIR', './uploads');
  }

  async process(job: Job<ImportJobData>) {
    const { importJobId, type, filePath } = job.data;
    const jobId = BigInt(importJobId);
    const absolutePath = path.join(this.uploadDir, filePath);

    let totalRows = 0;
    let successCount = 0;
    let errorCount = 0;
    const errors: { row: number; field: string; message: string }[] = [];

    try {
      // Stream CSV instead of loading entire file into memory
      const parser = fs.createReadStream(absolutePath, 'utf-8').pipe(
        parse({ columns: true, skip_empty_lines: true, trim: true, bom: true }),
      );

      let rowIndex = 0;
      for await (const row of parser) {
        rowIndex++;
        totalRows++;
        try {
          if (type === 'leads') {
            await this.processLeadRow(row, rowIndex + 1); // +1 for header
          } else {
            await this.processCustomerRow(row, rowIndex + 1);
          }
          successCount++;
        } catch (e: unknown) {
          errorCount++;
          const message = e instanceof Error ? e.message : String(e);
          errors.push({ row: rowIndex + 1, field: 'general', message });
        }

        // Update progress every 100 rows
        if (totalRows % 100 === 0) {
          await this.prisma.importJob.update({
            where: { id: jobId },
            data: { totalRows, successCount, errorCount },
          });
        }
      }

      // Generate error report if any
      let errorFileUrl: string | null = null;
      if (errors.length > 0) {
        const errorCsv = 'row,field,message\n' +
          errors.map((e) => `${e.row},"${e.field}","${e.message}"`).join('\n');
        const errorDir = path.join(this.uploadDir, 'imports', 'errors');
        fs.mkdirSync(errorDir, { recursive: true });
        const errorFile = `error-${importJobId}.csv`;
        fs.writeFileSync(path.join(errorDir, errorFile), errorCsv);
        errorFileUrl = `imports/errors/${errorFile}`;
      }

      // Update final status
      await this.prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          totalRows, successCount, errorCount,
          errorFileUrl,
          completedAt: new Date(),
        },
      });
    } catch (e: any) {
      await this.prisma.importJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', completedAt: new Date() },
      });
      throw e;
    }
  }

  private async processLeadRow(row: Record<string, string>, rowNum: number) {
    const phone = normalizePhone(row.phone || row['Số điện thoại'] || '');
    const name = row.name || row['Họ tên'] || phone;
    if (!phone) throw new Error('Thiếu số điện thoại');
    if (!isValidVNPhone(phone)) throw new Error(`SĐT không hợp lệ: ${phone}`);

    // Find or create customer
    let customer = await this.prisma.customer.findFirst({ where: { phone, deletedAt: null } });
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: { phone, name, email: row.email || null },
      });
    }

    // Find source by name
    const sourceName = row.source || row['Nguồn'] || null;
    let sourceId: bigint | null = null;
    if (sourceName) {
      const source = await this.prisma.leadSource.findFirst({ where: { name: sourceName } });
      if (source) sourceId = source.id;
    }

    // Dedup: same phone + same source + same product in this import → skip
    const productName = row.product || row['Sản phẩm'] || null;
    let productId: bigint | null = null;
    if (productName) {
      const product = await this.prisma.product.findFirst({
        where: { name: { contains: productName, mode: 'insensitive' }, deletedAt: null },
      });
      if (product) productId = product.id;
    }

    // Check dedup for CSV import
    const existingLead = await this.prisma.lead.findFirst({
      where: {
        phone, sourceId, productId, deletedAt: null,
      },
    });
    if (existingLead) throw new Error(`Trùng lead: SĐT ${phone} + nguồn + sản phẩm`);

    // Check skipPool on source
    let status: 'POOL' | 'ZOOM' = 'POOL';
    if (sourceId) {
      const src = await this.prisma.leadSource.findFirst({ where: { id: sourceId }, select: { skipPool: true } });
      if (src?.skipPool) status = 'ZOOM';
    }

    // Extra columns → metadata JSONB (any column not in known fields)
    const knownKeys = new Set(['phone', 'Số điện thoại', 'name', 'Họ tên', 'email', 'Email', 'source', 'Nguồn', 'product', 'Sản phẩm']);
    const metadata: Record<string, string> = {};
    for (const [key, val] of Object.entries(row)) {
      if (!knownKeys.has(key) && val && val.trim()) {
        metadata[key] = val.trim();
      }
    }

    const lead = await this.prisma.lead.create({
      data: {
        phone, name, email: row.email || null,
        status,
        customerId: customer.id,
        sourceId, productId,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      },
    });

    // Merge labels from customer → new lead
    if (customer.id) {
      const custLabels = await this.prisma.customerLabel.findMany({
        where: { customerId: customer.id },
        select: { labelId: true },
      });
      if (custLabels.length > 0) {
        await this.prisma.leadLabel.createMany({
          data: custLabels.map(cl => ({ leadId: lead.id, labelId: cl.labelId })),
          skipDuplicates: true,
        });
      }
    }
  }

  private async processCustomerRow(row: Record<string, string>, rowNum: number) {
    const phone = normalizePhone(row.phone || row['Số điện thoại'] || '');
    const name = row.name || row['Họ tên'] || '';
    if (!phone || !name) throw new Error('Thiếu phone hoặc name');
    if (!isValidVNPhone(phone)) throw new Error(`SĐT không hợp lệ: ${phone}`);

    const existing = await this.prisma.customer.findFirst({ where: { phone, deletedAt: null } });
    if (existing) throw new Error(`Trùng khách hàng: SĐT ${phone}`);

    await this.prisma.customer.create({
      data: { phone, name, email: row.email || null },
    });
  }
}
