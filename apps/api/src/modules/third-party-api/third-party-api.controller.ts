import { Controller, Post, Body } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { normalizePhone, isValidVNPhone } from '@crm/utils';
import { Public } from '../auth/decorators/public-route.decorator';
import { ApiKeyAuth } from '../auth/decorators/api-key-auth.decorator';

/** External lead ingestion API — requires x-api-key header. */
@Controller('external')
export class ThirdPartyApiController {
  constructor(private readonly prisma: PrismaClient) {}

  @Public()
  @ApiKeyAuth()
  @Post('leads')
  async createExternalLead(@Body() body: {
    name: string; phone: string; email?: string;
    source?: string; metadata?: Record<string, unknown>;
  }) {
    const phone = normalizePhone(body.phone);
    if (!isValidVNPhone(phone)) {
      return { error: 'Số điện thoại không hợp lệ' };
    }

    // Find or create source
    let sourceId: bigint | null = null;
    if (body.source) {
      let source = await this.prisma.leadSource.findFirst({
        where: { name: body.source },
      });
      if (!source) {
        source = await this.prisma.leadSource.create({ data: { name: body.source } });
      }
      sourceId = source.id;
    }

    // Find or create customer
    let customer = await this.prisma.customer.findFirst({
      where: { phone, deletedAt: null },
    });
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: { phone, name: body.name, email: body.email },
      });
    }

    // Validate metadata size — prevent oversized JSONB payloads
    let validatedMetadata: object | undefined;
    if (body.metadata) {
      const metaStr = JSON.stringify(body.metadata);
      if (metaStr.length > 10_000) {
        return { error: 'metadata quá lớn (tối đa 10KB)' };
      }
      validatedMetadata = body.metadata as object;
    }

    // Create lead (no dedup for API — always create new)
    const lead = await this.prisma.lead.create({
      data: {
        phone, name: body.name, email: body.email,
        status: 'POOL',
        customerId: customer.id,
        sourceId,
        ...(validatedMetadata ? { metadata: validatedMetadata } : {}),
      },
      select: { id: true, phone: true, name: true, status: true, customerId: true },
    });

    return { data: lead };
  }
}
