import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { createHash } from 'crypto';
import { BankTransactionsService } from './bank-transactions.service';
import { decodeBufferAuto } from '../import/csv-detect';

const HEADER_MAP: Record<string, string> = {
  'mã giao dịch': 'externalId',
  'external id': 'externalId',
  'externalid': 'externalId',
  'số tiền': 'amount',
  'amount': 'amount',
  'nội dung': 'content',
  'nội dung giao dịch': 'content',
  'content': 'content',
  'thời gian': 'transactionTime',
  'thời gian giao dịch': 'transactionTime',
  'ngày giao dịch': 'transactionTime',
  'transaction time': 'transactionTime',
  'tk nhận': 'bankAccount',
  'tài khoản nhận': 'bankAccount',
  'ngân hàng': 'bankAccount',
  'bank account': 'bankAccount',
  'tên người gửi': 'senderName',
  'người gửi': 'senderName',
  'sender name': 'senderName',
  'tk người gửi': 'senderAccount',
  'tài khoản người gửi': 'senderAccount',
  'sender account': 'senderAccount',
};

const CSV_HEADERS = [
  'Mã giao dịch',
  'Số tiền',
  'Nội dung',
  'Thời gian giao dịch',
  'TK nhận',
  'Tên người gửi',
  'TK người gửi',
];

export interface ImportRowError {
  row: number;
  externalId?: string;
  reason: string;
}

export interface ImportResult {
  total: number;
  imported: number;
  skipped_duplicate: number;
  auto_matched: number;
  errors: ImportRowError[];
}

interface RowPayload {
  externalId?: string;
  amount?: number;
  content?: string;
  transactionTime?: string;
  bankAccount?: string;
  senderName?: string;
  senderAccount?: string;
}

@Injectable()
export class BankTransactionImportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly bankTxService: BankTransactionsService,
  ) {}

  async importFromCsv(buffer: Buffer): Promise<ImportResult> {
    // Auto-detect encoding (UTF-8 / UTF-16 / Windows-1258) and delimiter so
    // Excel-saved CSVs from Vietnamese/EU locales work without manual fixing.
    const { text, delimiter } = decodeBufferAuto(buffer);
    let rows: Record<string, string>[];
    try {
      rows = parse(text, {
        columns: (header: string[]) =>
          header.map((h) => HEADER_MAP[h.trim().toLowerCase()] ?? `_ignored_${h}`),
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        delimiter,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không đọc được file CSV';
      throw new BadRequestException(`CSV không hợp lệ: ${msg}`);
    }

    const bankAccounts = await this.prisma.bankAccount.findMany({
      where: { isActive: true },
      select: { name: true },
    });
    const accountNames = new Set(bankAccounts.map((a) => a.name.toLowerCase()));

    const result: ImportResult = {
      total: 0,
      imported: 0,
      skipped_duplicate: 0,
      auto_matched: 0,
      errors: [],
    };

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // +2 = header is row 1, rows start at 2
      const raw = rows[i] as RowPayload;
      result.total++;

      try {
        const payload = this.buildPayload(raw);

        if (payload.bankAccount && accountNames.size > 0 && !accountNames.has(payload.bankAccount.toLowerCase())) {
          throw new Error(`Tên TK "${payload.bankAccount}" không tồn tại trong hệ thống`);
        }

        const ingested = await this.bankTxService.ingest({
          externalId: payload.externalId!,
          amount: payload.amount!,
          content: payload.content!,
          bankAccount: payload.bankAccount,
          senderName: payload.senderName,
          senderAccount: payload.senderAccount,
          transactionTime: payload.transactionTime,
        });

        result.imported++;
        if (ingested?.matchStatus === 'AUTO_MATCHED') result.auto_matched++;
      } catch (err) {
        if (err instanceof ConflictException) {
          result.skipped_duplicate++;
          continue;
        }
        const reason = err instanceof Error ? err.message : 'Lỗi không xác định';
        result.errors.push({ row: rowNum, externalId: raw.externalId, reason });
      }
    }

    return result;
  }

  private buildPayload(raw: RowPayload): Required<Pick<RowPayload, 'externalId' | 'amount' | 'content'>> & RowPayload {
    const content = (raw.content ?? '').toString().trim();
    if (!content) throw new Error('Nội dung giao dịch bắt buộc');

    const amount = parseVNAmount(raw.amount as unknown as string);
    if (!amount || amount <= 0) throw new Error('Số tiền phải > 0');

    const transactionTime = parseFlexDate(raw.transactionTime as unknown as string);
    const bankAccount = normalizeText(raw.bankAccount);
    const senderName = normalizeText(raw.senderName);
    const senderAccount = normalizeText(raw.senderAccount);
    const externalIdRaw = normalizeText(raw.externalId);

    const externalId = externalIdRaw
      ? externalIdRaw.replace(/[^\w\-.]/g, '').slice(0, 255)
      : generateExternalId({ transactionTime, amount, content, senderAccount });

    if (!externalId) throw new Error('Không tạo được externalId');

    return { externalId, amount, content, transactionTime, bankAccount, senderName, senderAccount };
  }

  generateTemplate(): Buffer {
    const BOM = '﻿';
    const headerLine = CSV_HEADERS.join(',');
    const sampleRow = [
      'FT26042212345',
      '5000000',
      'CK khoa hoc ABC',
      '2026-04-22 10:30:00',
      'VCB 999',
      'Nguyễn Văn A',
      '0123456789',
    ]
      .map(csvEscape)
      .join(',');
    return Buffer.from(BOM + headerLine + '\r\n' + sampleRow + '\r\n', 'utf8');
  }
}

function normalizeText(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

function parseVNAmount(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') return raw;
  // Strip non-numeric chars except . , -
  const cleaned = String(raw).replace(/[^\d,.-]/g, '');
  // VN format: 1.000.000,50 | Intl: 1,000,000.50 | plain: 1000000
  let normalized = cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // Use last separator as decimal
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    // Ambiguous - treat comma as thousands if >1 comma or group-of-3
    const parts = cleaned.split(',');
    if (parts.length > 2 || (parts[1] && parts[1].length === 3)) {
      normalized = cleaned.replace(/,/g, '');
    } else {
      normalized = cleaned.replace(',', '.');
    }
  } else if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    // If any non-last group is 3 digits → thousands separator
    if (parts.length > 2 || (parts[1] && parts[1].length === 3)) {
      normalized = cleaned.replace(/\./g, '');
    }
  }
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

function parseFlexDate(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;

  // Try native parse (ISO, yyyy-MM-dd HH:mm:ss, etc.)
  const direct = new Date(s);
  if (!isNaN(direct.getTime())) return direct.toISOString();

  // Try dd/MM/yyyy[ HH:mm[:ss]]
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (m) {
    const [, dd, mm, yyyy, hh = '0', mi = '0', ss = '0'] = m;
    const d = new Date(
      parseInt(yyyy),
      parseInt(mm) - 1,
      parseInt(dd),
      parseInt(hh),
      parseInt(mi),
      parseInt(ss),
    );
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return undefined;
}

function generateExternalId(parts: {
  transactionTime?: string;
  amount: number;
  content: string;
  senderAccount?: string;
}): string {
  const seed = `${parts.transactionTime ?? ''}|${parts.amount}|${parts.content}|${parts.senderAccount ?? ''}`;
  const hash = createHash('sha1').update(seed).digest('hex').slice(0, 32);
  return `csv-${hash}`;
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
