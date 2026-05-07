import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaClient, ImportStatus, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { parse } from 'csv-parse';
import { ConfigService } from '@nestjs/config';
import { decodeBufferAuto } from './csv-detect';
import {
  ImportValidationService,
  LookupMaps,
} from './import-validation.service';

export interface ImportJobData {
  importJobId: string;
  type: 'leads' | 'customers';
  filePath: string;
  /** When true, validate only - count + sample errors, no DB writes. */
  dryRun: boolean;
}

const SAMPLE_ERROR_LIMIT = 5;

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
    private readonly validationService: ImportValidationService,
  ) {
    super();
    this.uploadDir = configService.get('UPLOAD_DIR', './uploads');
  }

  async process(job: Job<ImportJobData>) {
    const { importJobId, type, filePath, dryRun } = job.data;
    const jobId = BigInt(importJobId);
    const absolutePath = path.join(this.uploadDir, filePath);

    let totalRows = 0;
    let successCount = 0;
    let errorCount = 0;
    const errors: { row: number; originalRow: Record<string, string>; message: string }[] = [];
    const warnings: { row: number; originalRow: Record<string, string>; messages: string[] }[] = [];
    let originalHeaders: string[] = [];

    try {
      const jobRecord = await this.prisma.importJob.findUnique({
        where: { id: jobId },
        select: { createdBy: true },
      });
      const createdBy = jobRecord?.createdBy ?? null;

      const lookups = await this.preloadLookups();
      const phoneCache = new Map<string, { id: bigint }>();

      // Auto-detect encoding (UTF-8 / UTF-16 / Windows-1258) and delimiter so users
      // can upload Excel-saved CSVs without manual re-encoding. 10MB cap upstream.
      const buf = await fs.promises.readFile(absolutePath);
      const { text, delimiter } = decodeBufferAuto(buf);
      const parser = Readable.from(text).pipe(
        parse({ columns: true, skip_empty_lines: true, trim: true, bom: true, delimiter }),
      );

      let rowIndex = 0;
      for await (const row of parser) {
        rowIndex++;
        totalRows++;

        if (originalHeaders.length === 0) {
          originalHeaders = Object.keys(row);
          // Header sanity check - if Excel saved as ANSI on a VN locale, diacritics
          // get replaced with '?' and "Số điện thoại" becomes unreadable. Fail fast.
          const hasPhone = 'phone' in row || 'Số điện thoại' in row;
          if (!hasPhone) {
            const guidance =
              `Không nhận diện được cột "Số điện thoại". ` +
              `Header đọc được: [${originalHeaders.join(', ')}]. ` +
              `Hãy lưu lại file bằng "CSV UTF-8 (Comma delimited)" trong Excel rồi thử lại.`;
            errors.push({ row: rowIndex + 1, originalRow: row, message: guidance });
            errorCount++;
            break;
          }
        }

        const result =
          type === 'leads'
            ? await this.validationService.validateLeadRow(row, rowIndex + 1, lookups, phoneCache)
            : await this.validationService.validateCustomerRow(row, rowIndex + 1, lookups);

        if (!result.valid) {
          errorCount++;
          errors.push({ row: rowIndex + 1, originalRow: row, message: result.error });
          continue;
        }

        if (dryRun) {
          successCount++;
          if (result.warnings.length > 0) {
            warnings.push({ row: rowIndex + 1, originalRow: row, messages: result.warnings });
          }
          continue;
        }

        // Real insert path
        try {
          const insertWarnings =
            type === 'leads'
              ? await this.validationService.insertLead(result.parsed as any, phoneCache, createdBy)
              : await this.validationService.insertCustomer(result.parsed as any, createdBy);
          successCount++;
          if (insertWarnings.length > 0) {
            warnings.push({ row: rowIndex + 1, originalRow: row, messages: insertWarnings });
          }
        } catch (e: unknown) {
          errorCount++;
          const message = e instanceof Error ? e.message : String(e);
          errors.push({ row: rowIndex + 1, originalRow: row, message });
        }

        if (totalRows % 100 === 0) {
          await this.prisma.importJob.update({
            where: { id: jobId },
            data: { totalRows, successCount, errorCount },
          });
        }
      }

      if (dryRun) {
        await this.finalizeDryRun(jobId, totalRows, successCount, errorCount, errors);
      } else {
        const errorFileUrl = await this.writeIssuesFile(
          importJobId,
          originalHeaders,
          errors,
          warnings,
        );
        await this.prisma.importJob.update({
          where: { id: jobId },
          data: {
            status: ImportStatus.COMPLETED,
            totalRows,
            successCount,
            errorCount,
            errorFileUrl,
            completedAt: new Date(),
          },
        });
      }
    } catch (e: any) {
      await this.prisma.importJob.update({
        where: { id: jobId },
        data: { status: ImportStatus.FAILED, completedAt: new Date() },
      });
      throw e;
    }
  }

  private async preloadLookups(): Promise<LookupMaps> {
    const [allSources, allProducts, allLabels] = await Promise.all([
      this.prisma.leadSource.findMany({ select: { id: true, name: true, skipPool: true } }),
      this.prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
      this.prisma.label.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    ]);
    return {
      sourceMap: new Map(allSources.map((s) => [s.name.toLowerCase(), s])),
      productMap: new Map(allProducts.map((p) => [p.name.toLowerCase(), p])),
      labelMap: new Map(allLabels.map((l) => [l.name.toLowerCase(), l])),
    };
  }

  private async finalizeDryRun(
    jobId: bigint,
    totalRows: number,
    validRows: number,
    errorRows: number,
    errors: { row: number; message: string }[],
  ) {
    const previewSummary = {
      totalRows,
      validRows,
      errorRows,
      sampleErrors: errors.slice(0, SAMPLE_ERROR_LIMIT).map((e) => ({
        row: e.row,
        message: e.message,
      })),
    };
    await this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: ImportStatus.REVIEWED,
        totalRows,
        successCount: validRows,
        errorCount: errorRows,
        previewSummary: previewSummary as Prisma.InputJsonValue,
        reviewedAt: new Date(),
      },
    });
  }

  private async writeIssuesFile(
    importJobId: string,
    originalHeaders: string[],
    errors: { row: number; originalRow: Record<string, string>; message: string }[],
    warnings: { row: number; originalRow: Record<string, string>; messages: string[] }[],
  ): Promise<string | null> {
    const hasIssues = errors.length > 0 || warnings.length > 0;
    if (!hasIssues || originalHeaders.length === 0) return null;

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
    return `imports/errors/${errorFile}`;
  }
}
