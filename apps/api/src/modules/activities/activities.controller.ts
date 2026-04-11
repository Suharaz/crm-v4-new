import { Controller, Get, Post, Body, Param, Query, Inject, forwardRef, BadRequestException, ParseEnumPipe } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { ActivitiesService } from './activities.service';
import { LeadsService } from '../leads/leads.service';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller()
export class ActivitiesController {
  constructor(
    private readonly service: ActivitiesService,
    @Inject(forwardRef(() => LeadsService)) private readonly leadsService: LeadsService,
  ) {}

  // Dept stats — must be before /:id routes to avoid param clash
  @Get('activities/stats/by-department')
  async statsByDepartment(
    @Query('entityType', new ParseEnumPipe(EntityType)) entityType: EntityType,
    @Query('entityId') entityIdStr: string,
  ) {
    if (!entityIdStr) throw new BadRequestException('entityId là bắt buộc');
    const entityId = BigInt(entityIdStr);
    return this.service.getStatsByDepartment(entityType, entityId);
  }

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
    if (!body.content || body.content.trim() === '') {
      throw new BadRequestException('Nội dung ghi chú không được để trống');
    }
    const data = await this.service.createNote('LEAD' as EntityType, id, user.id, body.content);

    // Auto-trigger IN_PROGRESS on first note for ASSIGNED lead
    await this.leadsService.triggerInProgress(id, user.id);

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
    if (!body.content || body.content.trim() === '') {
      throw new BadRequestException('Nội dung ghi chú không được để trống');
    }
    const data = await this.service.createNote('CUSTOMER' as EntityType, id, user.id, body.content);
    return { data };
  }
}
