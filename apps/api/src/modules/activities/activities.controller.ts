import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { ActivitiesService } from './activities.service';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller()
export class ActivitiesController {
  constructor(private readonly service: ActivitiesService) {}

  // Lead activities
  @Get('leads/:id/activities')
  async leadTimeline(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.getTimeline('LEAD' as EntityType, id, limit ?? 20, cursor);
  }

  @Post('leads/:id/activities')
  async createLeadNote(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { content: string },
    @CurrentUser() user: any,
  ) {
    const data = await this.service.createNote('LEAD' as EntityType, id, user.id, body.content);

    // Auto-trigger IN_PROGRESS on first note for ASSIGNED lead
    await this.triggerInProgress(id, user.id);

    return { data };
  }

  // Customer activities
  @Get('customers/:id/activities')
  async customerTimeline(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.getTimeline('CUSTOMER' as EntityType, id, limit ?? 20, cursor);
  }

  @Post('customers/:id/activities')
  async createCustomerNote(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { content: string },
    @CurrentUser() user: any,
  ) {
    const data = await this.service.createNote('CUSTOMER' as EntityType, id, user.id, body.content);
    return { data };
  }

  /** Auto IN_PROGRESS trigger when sale creates first note on ASSIGNED lead. */
  private async triggerInProgress(leadId: bigint, userId: bigint) {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    try {
      const lead = await prisma.lead.findFirst({
        where: { id: leadId, status: 'ASSIGNED', deletedAt: null },
      });
      if (!lead) return;

      await prisma.lead.update({ where: { id: leadId }, data: { status: 'IN_PROGRESS' } });
      await prisma.activity.create({
        data: {
          entityType: 'LEAD', entityId: leadId, userId,
          type: 'STATUS_CHANGE',
          content: 'ASSIGNED → IN_PROGRESS (tự động khi tạo note)',
          metadata: { fromStatus: 'ASSIGNED', toStatus: 'IN_PROGRESS', auto: true },
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  }
}
