import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { normalizePhone, isValidVNPhone } from '@crm/utils';
import { CustomerPhonesService } from '../customers/customer-phones.service';

export type LookupSource = { id: bigint; name: string; skipPool: boolean };
export type LookupProduct = { id: bigint; name: string };
export type LookupLabel = { id: bigint; name: string };

export interface LookupMaps {
  sourceMap: Map<string, LookupSource>;
  productMap: Map<string, LookupProduct>;
  labelMap: Map<string, LookupLabel>;
}

export interface ParsedLead {
  rowNum: number;
  phone: string;
  name: string;
  email: string | null;
  sourceId: bigint | null;
  source: LookupSource | null;
  productId: bigint | null;
  existingCustomerId: bigint | null;
  csvLabelNames: string[];
  resolvedFirstLabelId: bigint | null;
  noteRaw: string;
  metadata: Record<string, string>;
  warnings: string[];
}

export interface ParsedCustomer {
  rowNum: number;
  phone: string;
  name: string;
  email: string | null;
  companyName: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  zaloUrl: string | null;
  linkedinUrl: string | null;
  shortDescription: string | null;
  description: string | null;
  noteRaw: string;
  csvLabelNames: string[];
  matchedLabelIds: bigint[];
  warnings: string[];
}

export type ValidationResult<T> =
  | { valid: true; parsed: T; warnings: string[] }
  | { valid: false; error: string };

const LEAD_KNOWN_KEYS = new Set([
  'phone', 'Số điện thoại',
  'name', 'Họ tên',
  'email', 'Email',
  'source', 'Nguồn',
  'product', 'Sản phẩm',
  'labels', 'Nhãn',
  'note', 'Ghi chú',
]);

@Injectable()
export class ImportValidationService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    private readonly customerPhonesService: CustomerPhonesService,
  ) {}

  async validateLeadRow(
    row: Record<string, string>,
    rowNum: number,
    lookups: LookupMaps,
    phoneCache: Map<string, { id: bigint }>,
  ): Promise<ValidationResult<ParsedLead>> {
    const warnings: string[] = [];
    const phone = normalizePhone(row.phone || row['Số điện thoại'] || '');
    const name = row.name || row['Họ tên'] || phone;
    if (!phone) return { valid: false, error: 'Thiếu số điện thoại' };
    if (!isValidVNPhone(phone)) return { valid: false, error: `SĐT không hợp lệ: ${phone}` };

    let existingCustomerId: bigint | null = phoneCache.get(phone)?.id ?? null;
    if (!existingCustomerId) {
      const dbCustomer = await this.customerPhonesService.findCustomerByAnyPhone(phone);
      if (dbCustomer) {
        existingCustomerId = dbCustomer.id;
        phoneCache.set(phone, { id: dbCustomer.id });
      }
    }

    const sourceName = row.source || row['Nguồn'] || null;
    const source = sourceName ? lookups.sourceMap.get(sourceName.toLowerCase()) ?? null : null;
    const sourceId = source?.id ?? null;

    const productName = row.product || row['Sản phẩm'] || null;
    let product: LookupProduct | null = null;
    if (productName) {
      const key = productName.toLowerCase();
      product =
        lookups.productMap.get(key) ||
        [...lookups.productMap.values()].find((p) => p.name.toLowerCase().includes(key)) ||
        null;
      if (!product) {
        return { valid: false, error: `Sản phẩm "${productName}" không tồn tại trong hệ thống` };
      }
    }
    const productId = product?.id ?? null;

    const existingLead = await this.prisma.lead.findFirst({
      where: { phone, sourceId, productId, deletedAt: null },
      select: { id: true },
    });
    if (existingLead) return { valid: false, error: `Trùng lead: SĐT ${phone} + nguồn + sản phẩm` };

    const labelsRaw = row.labels || row['Nhãn'] || '';
    const noteRaw = (row.note || row['Ghi chú'] || '').trim();
    const csvLabelNames = labelsRaw.trim()
      ? labelsRaw.split(',').map((l) => l.trim()).filter(Boolean)
      : [];

    let resolvedFirstLabelId: bigint | null = null;
    const resolvedLabelNames: string[] = [];
    for (const labelName of csvLabelNames) {
      const found = lookups.labelMap.get(labelName.toLowerCase());
      if (found) {
        resolvedLabelNames.push(labelName);
        if (resolvedFirstLabelId === null) resolvedFirstLabelId = found.id;
      } else {
        warnings.push(`Nhãn "${labelName}" không tồn tại trong hệ thống - bỏ qua`);
      }
    }
    if (resolvedLabelNames.length > 1) {
      warnings.push(
        `Lead chỉ nhận 1 nhãn - áp dụng "${resolvedLabelNames[0]}", bỏ qua: ${resolvedLabelNames.slice(1).join(', ')}`,
      );
    }

    const metadata: Record<string, string> = {};
    for (const [key, val] of Object.entries(row)) {
      if (!LEAD_KNOWN_KEYS.has(key) && val && val.trim()) {
        metadata[key] = val.trim();
      }
    }

    return {
      valid: true,
      warnings,
      parsed: {
        rowNum,
        phone,
        name,
        email: row.email || null,
        sourceId,
        source,
        productId,
        existingCustomerId,
        csvLabelNames,
        resolvedFirstLabelId,
        noteRaw,
        metadata,
        warnings,
      },
    };
  }

  async insertLead(
    parsed: ParsedLead,
    phoneCache: Map<string, { id: bigint }>,
    createdBy: bigint | null,
  ): Promise<string[]> {
    const warnings = [...parsed.warnings];
    let customerId = parsed.existingCustomerId ?? phoneCache.get(parsed.phone)?.id ?? null;
    if (!customerId) {
      // Re-check in case another row in this batch created the customer.
      const dbCustomer = await this.customerPhonesService.findCustomerByAnyPhone(parsed.phone);
      if (dbCustomer) {
        customerId = dbCustomer.id;
      } else {
        const newCustomer = await this.prisma.customer.create({
          data: { phone: parsed.phone, name: parsed.name, email: parsed.email },
        });
        customerId = newCustomer.id;
      }
      phoneCache.set(parsed.phone, { id: customerId });
    }

    const status: 'POOL' | 'ZOOM' = parsed.source?.skipPool ? 'ZOOM' : 'POOL';

    const lead = await this.prisma.lead.create({
      data: {
        phone: parsed.phone,
        name: parsed.name,
        email: parsed.email,
        status,
        customerId,
        sourceId: parsed.sourceId,
        productId: parsed.productId,
        ...(Object.keys(parsed.metadata).length > 0 ? { metadata: parsed.metadata } : {}),
      },
    });

    let labelId = parsed.resolvedFirstLabelId;
    if (labelId === null) {
      // Inherit first label from existing customer when CSV had none.
      const firstCustLabel = await this.prisma.customerLabel.findFirst({
        where: { customerId },
        select: { labelId: true },
      });
      if (firstCustLabel) labelId = firstCustLabel.labelId;
    }
    if (labelId !== null) {
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { labelId, labelAssignedAt: new Date() },
      });
    }

    if (parsed.noteRaw) {
      if (createdBy) {
        await this.prisma.activity.create({
          data: {
            entityType: 'LEAD',
            entityId: lead.id,
            userId: createdBy,
            type: 'NOTE',
            content: parsed.noteRaw,
          },
        });
      } else {
        warnings.push('Không xác định được người upload - note bị bỏ qua');
      }
    }

    return warnings;
  }

  async validateCustomerRow(
    row: Record<string, string>,
    rowNum: number,
    lookups: LookupMaps,
  ): Promise<ValidationResult<ParsedCustomer>> {
    const warnings: string[] = [];
    const phone = normalizePhone(row.phone || row['Số điện thoại'] || '');
    const name = row.name || row['Họ tên'] || '';
    if (!phone || !name) return { valid: false, error: 'Thiếu phone hoặc name' };
    if (!isValidVNPhone(phone)) return { valid: false, error: `SĐT không hợp lệ: ${phone}` };

    try {
      await this.customerPhonesService.assertPhoneNotExists(phone);
    } catch {
      return { valid: false, error: `Trùng khách hàng: SĐT ${phone}` };
    }

    const labelsRaw = row.labels || row['Nhãn'] || '';
    const csvLabelNames = labelsRaw.trim()
      ? labelsRaw.split(',').map((l) => l.trim()).filter(Boolean)
      : [];
    const matchedLabelIds: bigint[] = [];
    for (const labelName of csvLabelNames) {
      const found = lookups.labelMap.get(labelName.toLowerCase());
      if (found) {
        matchedLabelIds.push(found.id);
      } else {
        warnings.push(`Nhãn "${labelName}" không tồn tại trong hệ thống - bỏ qua`);
      }
    }

    return {
      valid: true,
      warnings,
      parsed: {
        rowNum,
        phone,
        name,
        email: row.email || row['Email'] || null,
        companyName: row.companyName || row['Công ty'] || null,
        facebookUrl: row.facebookUrl || row['Facebook'] || null,
        instagramUrl: row.instagramUrl || row['Instagram'] || null,
        zaloUrl: row.zaloUrl || row['Zalo'] || null,
        linkedinUrl: row.linkedinUrl || row['LinkedIn'] || null,
        shortDescription: row.shortDescription || row['Mô tả ngắn'] || null,
        description: row.description || row['Mô tả'] || null,
        noteRaw: (row.note || row['Ghi chú'] || '').trim(),
        csvLabelNames,
        matchedLabelIds,
        warnings,
      },
    };
  }

  async insertCustomer(parsed: ParsedCustomer, createdBy: bigint | null): Promise<string[]> {
    const warnings = [...parsed.warnings];
    const customer = await this.prisma.customer.create({
      data: {
        phone: parsed.phone,
        name: parsed.name,
        email: parsed.email,
        ...(parsed.companyName ? { companyName: parsed.companyName } : {}),
        ...(parsed.facebookUrl ? { facebookUrl: parsed.facebookUrl } : {}),
        ...(parsed.instagramUrl ? { instagramUrl: parsed.instagramUrl } : {}),
        ...(parsed.zaloUrl ? { zaloUrl: parsed.zaloUrl } : {}),
        ...(parsed.linkedinUrl ? { linkedinUrl: parsed.linkedinUrl } : {}),
        ...(parsed.shortDescription ? { shortDescription: parsed.shortDescription } : {}),
        ...(parsed.description ? { description: parsed.description } : {}),
      },
    });

    if (parsed.matchedLabelIds.length > 0) {
      await this.prisma.customerLabel.createMany({
        data: parsed.matchedLabelIds.map((labelId) => ({ customerId: customer.id, labelId })),
        skipDuplicates: true,
      });
    }

    if (parsed.noteRaw) {
      if (createdBy) {
        await this.prisma.activity.create({
          data: {
            entityType: 'CUSTOMER',
            entityId: customer.id,
            userId: createdBy,
            type: 'NOTE',
            content: parsed.noteRaw,
          },
        });
      } else {
        warnings.push('Không xác định được người upload - note bị bỏ qua');
      }
    }

    return warnings;
  }
}
