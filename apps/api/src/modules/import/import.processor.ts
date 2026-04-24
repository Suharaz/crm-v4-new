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

/**
 * Escape a CSV cell per RFC 4180: wrap in quotes if value contains quote/comma/newline,
 * and double up any internal quotes. Prevents row misalignment when error messages or
 * original data contain commas/quotes.
 */
function escapeCsvCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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
    const errors: { row: number; originalRow: Record<string, string>; message: string }[] = [];
    // Warnings: row succeeded but had non-fatal issues (e.g. label không tồn tại). Still counted as success.
    const warnings: { row: number; originalRow: Record<string, string>; messages: string[] }[] = [];
    let originalHeaders: string[] = [];

    try {
      // Load the owner (createdBy) of this import job — needed to attribute Activity NOTE rows
      // created when a CSV row contains a `note`/`Ghi chú` column. Loaded once, not per row.
      const jobRecord = await this.prisma.importJob.findUnique({
        where: { id: jobId },
        select: { createdBy: true },
      });
      const createdBy = jobRecord?.createdBy ?? null;

      // Preload lookup tables to avoid N+1 queries per row (PERF-H4)
      const [allSources, allProducts, allLabels] = await Promise.all([
        this.prisma.leadSource.findMany({ select: { id: true, name: true, skipPool: true } }),
        this.prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
        this.prisma.label.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      ]);
      const sourceMap = new Map(allSources.map(s => [s.name.toLowerCase(), s]));
      const productMap = new Map(allProducts.map(p => [p.name.toLowerCase(), p]));
      const labelMap = new Map(allLabels.map(l => [l.name.toLowerCase(), l]));
      const phoneCache = new Map<string, { id: bigint }>(); // phone → customer

      // Stream CSV instead of loading entire file into memory
      const parser = fs.createReadStream(absolutePath, 'utf-8').pipe(
        parse({ columns: true, skip_empty_lines: true, trim: true, bom: true }),
      );

      let rowIndex = 0;
      for await (const row of parser) {
        rowIndex++;
        totalRows++;
        // Capture headers from first row so error file preserves original columns
        if (originalHeaders.length === 0) {
          originalHeaders = Object.keys(row);
        }
        try {
          const rowWarnings =
            type === 'leads'
              ? await this.processLeadRow(row, rowIndex + 1, sourceMap, productMap, labelMap, phoneCache, createdBy)
              : await this.processCustomerRow(row, rowIndex + 1, labelMap, createdBy);
          successCount++;
          if (rowWarnings.length > 0) {
            warnings.push({ row: rowIndex + 1, originalRow: row, messages: rowWarnings });
          }
        } catch (e: unknown) {
          errorCount++;
          const message = e instanceof Error ? e.message : String(e);
          errors.push({ row: rowIndex + 1, originalRow: row, message });
        }

        // Update progress every 100 rows
        if (totalRows % 100 === 0) {
          await this.prisma.importJob.update({
            where: { id: jobId },
            data: { totalRows, successCount, errorCount },
          });
        }
      }

      // Generate issues report (errors + warnings) preserving original columns.
      // Column "Loại" distinguishes fatal errors from non-fatal warnings so user can filter in Excel.
      // User can fix inline and re-upload directly without cross-referencing original file.
      let errorFileUrl: string | null = null;
      const hasIssues = errors.length > 0 || warnings.length > 0;
      if (hasIssues && originalHeaders.length > 0) {
        const headerRow = [...originalHeaders, 'Dòng', 'Loại', 'Thông điệp'];
        const errorRows = errors.map((e) => {
          const cells = originalHeaders.map((h) => escapeCsvCell(e.originalRow[h] ?? ''));
          cells.push(escapeCsvCell(String(e.row)));
          cells.push(escapeCsvCell('Lỗi'));
          cells.push(escapeCsvCell(e.message));
          return cells.join(',');
        });
        const warningRows = warnings.map((w) => {
          const cells = originalHeaders.map((h) => escapeCsvCell(w.originalRow[h] ?? ''));
          cells.push(escapeCsvCell(String(w.row)));
          cells.push(escapeCsvCell('Cảnh báo'));
          // Join multiple warning messages for the same row with " | " so the CSV stays one row per source row
          cells.push(escapeCsvCell(w.messages.join(' | ')));
          return cells.join(',');
        });
        const dataRows = [...errorRows, ...warningRows];
        // UTF-8 BOM so Excel renders Vietnamese diacritics correctly
        const bom = '﻿';
        const errorCsv = bom + headerRow.map(escapeCsvCell).join(',') + '\n' + dataRows.join('\n');
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

  /** Returns array of non-fatal warning messages. Row still counts as success. */
  private async processLeadRow(
    row: Record<string, string>,
    rowNum: number,
    sourceMap: Map<string, { id: bigint; name: string; skipPool: boolean }>,
    productMap: Map<string, { id: bigint; name: string }>,
    labelMap: Map<string, { id: bigint; name: string }>,
    phoneCache: Map<string, { id: bigint }>,
    createdBy: bigint | null,
  ): Promise<string[]> {
    const warnings: string[] = [];
    const phone = normalizePhone(row.phone || row['Số điện thoại'] || '');
    const name = row.name || row['Họ tên'] || phone;
    if (!phone) throw new Error('Thiếu số điện thoại');
    if (!isValidVNPhone(phone)) throw new Error(`SĐT không hợp lệ: ${phone}`);

    // Find or create customer (with in-memory cache)
    let customer = phoneCache.get(phone) || null;
    if (!customer) {
      const dbCustomer = await this.prisma.customer.findFirst({ where: { phone, deletedAt: null } });
      if (dbCustomer) {
        customer = { id: dbCustomer.id };
      } else {
        const newCustomer = await this.prisma.customer.create({
          data: { phone, name, email: row.email || null },
        });
        customer = { id: newCustomer.id };
      }
      phoneCache.set(phone, customer);
    }

    // Find source by name (preloaded Map — O(1) instead of DB query)
    const sourceName = row.source || row['Nguồn'] || null;
    const source = sourceName ? sourceMap.get(sourceName.toLowerCase()) || null : null;
    const sourceId = source?.id || null;

    // Find product by name (preloaded — substring match to preserve original behavior)
    const productName = row.product || row['Sản phẩm'] || null;
    let product: { id: bigint; name: string } | null = null;
    if (productName) {
      const key = productName.toLowerCase();
      // Try exact match first, then substring match (same as original ILIKE '%name%')
      product = productMap.get(key) ||
        [...productMap.values()].find(p => p.name.toLowerCase().includes(key)) || null;
      if (!product) {
        throw new Error(`Sản phẩm "${productName}" không tồn tại trong hệ thống`);
      }
    }
    const productId = product?.id || null;

    // Check dedup for CSV import
    const existingLead = await this.prisma.lead.findFirst({
      where: { phone, sourceId, productId, deletedAt: null },
    });
    if (existingLead) throw new Error(`Trùng lead: SĐT ${phone} + nguồn + sản phẩm`);

    // Check skipPool on source (already preloaded)
    const status: 'POOL' | 'ZOOM' = source?.skipPool ? 'ZOOM' : 'POOL';

    // Read labels + note first so they are excluded from the metadata bucket below.
    const labelsRaw = row.labels || row['Nhãn'] || '';
    const noteRaw = (row.note || row['Ghi chú'] || '').trim();

    // Extra columns → metadata JSONB (any column not in known fields)
    const knownKeys = new Set([
      'phone', 'Số điện thoại',
      'name', 'Họ tên',
      'email', 'Email',
      'source', 'Nguồn',
      'product', 'Sản phẩm',
      'labels', 'Nhãn',
      'note', 'Ghi chú',
    ]);
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

    // Labels: merge customer's existing labels + labels from CSV. Unknown label names → warning, not fatal.
    const labelIds = new Set<string>(); // bigint → string for dedup in Set
    if (customer.id) {
      const custLabels = await this.prisma.customerLabel.findMany({
        where: { customerId: customer.id },
        select: { labelId: true },
      });
      custLabels.forEach(cl => labelIds.add(cl.labelId.toString()));
    }
    if (labelsRaw.trim()) {
      const labelNames = labelsRaw.split(',').map(l => l.trim()).filter(Boolean);
      for (const labelName of labelNames) {
        const found = labelMap.get(labelName.toLowerCase());
        if (found) {
          labelIds.add(found.id.toString());
        } else {
          warnings.push(`Nhãn "${labelName}" không tồn tại trong hệ thống — bỏ qua`);
        }
      }
    }
    if (labelIds.size > 0) {
      await this.prisma.leadLabel.createMany({
        data: [...labelIds].map(id => ({ leadId: lead.id, labelId: BigInt(id) })),
        skipDuplicates: true,
      });
    }

    // Note: create an Activity(type=NOTE) so it shows up in the lead timeline.
    // Requires createdBy (uploader). If the uploader record is gone, silently skip with a warning.
    if (noteRaw) {
      if (createdBy) {
        await this.prisma.activity.create({
          data: {
            entityType: 'LEAD',
            entityId: lead.id,
            userId: createdBy,
            type: 'NOTE',
            content: noteRaw,
          },
        });
      } else {
        warnings.push('Không xác định được người upload — note bị bỏ qua');
      }
    }

    return warnings;
  }

  /** Returns array of warning messages (e.g. unmatched labels). Row still counts as success. */
  private async processCustomerRow(
    row: Record<string, string>,
    rowNum: number,
    labelMap: Map<string, { id: bigint; name: string }>,
    createdBy: bigint | null,
  ): Promise<string[]> {
    const warnings: string[] = [];
    const phone = normalizePhone(row.phone || row['Số điện thoại'] || '');
    const name = row.name || row['Họ tên'] || '';
    if (!phone || !name) throw new Error('Thiếu phone hoặc name');
    if (!isValidVNPhone(phone)) throw new Error(`SĐT không hợp lệ: ${phone}`);

    const existing = await this.prisma.customer.findFirst({ where: { phone, deletedAt: null } });
    if (existing) throw new Error(`Trùng khách hàng: SĐT ${phone}`);

    // Optional fields — support both English and Vietnamese column names
    const email = row.email || row['Email'] || null;
    const companyName = row.companyName || row['Công ty'] || null;
    const facebookUrl = row.facebookUrl || row['Facebook'] || null;
    const instagramUrl = row.instagramUrl || row['Instagram'] || null;
    const zaloUrl = row.zaloUrl || row['Zalo'] || null;
    const linkedinUrl = row.linkedinUrl || row['LinkedIn'] || null;
    const shortDescription = row.shortDescription || row['Mô tả ngắn'] || null;
    const description = row.description || row['Mô tả'] || null;
    const noteRaw = (row.note || row['Ghi chú'] || '').trim();

    const customer = await this.prisma.customer.create({
      data: {
        phone, name, email,
        ...(companyName ? { companyName } : {}),
        ...(facebookUrl ? { facebookUrl } : {}),
        ...(instagramUrl ? { instagramUrl } : {}),
        ...(zaloUrl ? { zaloUrl } : {}),
        ...(linkedinUrl ? { linkedinUrl } : {}),
        ...(shortDescription ? { shortDescription } : {}),
        ...(description ? { description } : {}),
      },
    });

    // Attach labels (comma-separated names, matched case-insensitive from DB)
    const labelsRaw = row.labels || row['Nhãn'] || '';
    if (labelsRaw.trim()) {
      const labelNames = labelsRaw.split(',').map(l => l.trim()).filter(Boolean);
      const matchedLabels: { id: bigint }[] = [];
      for (const labelName of labelNames) {
        const found = labelMap.get(labelName.toLowerCase());
        if (found) {
          matchedLabels.push(found);
        } else {
          warnings.push(`Nhãn "${labelName}" không tồn tại trong hệ thống — bỏ qua`);
        }
      }
      if (matchedLabels.length > 0) {
        await this.prisma.customerLabel.createMany({
          data: matchedLabels.map(l => ({ customerId: customer.id, labelId: l.id })),
          skipDuplicates: true,
        });
      }
    }

    // Note: create Activity(type=NOTE) attributed to the uploader so it appears on the customer timeline.
    if (noteRaw) {
      if (createdBy) {
        await this.prisma.activity.create({
          data: {
            entityType: 'CUSTOMER',
            entityId: customer.id,
            userId: createdBy,
            type: 'NOTE',
            content: noteRaw,
          },
        });
      } else {
        warnings.push('Không xác định được người upload — note bị bỏ qua');
      }
    }

    return warnings;
  }
}
