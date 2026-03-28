import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { UserRole, EntityType } from '@prisma/client';
import { CallLogsService } from './call-logs.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { Public } from '../auth/decorators/public-route.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Controller('call-logs')
export class CallLogsController {
  constructor(private readonly service: CallLogsService) {}

  /** Ingest call from 3rd party (API key auth - simplified to Public for now). */
  @Public()
  @Post('ingest')
  async ingest(@Body() body: {
    externalId: string; phoneNumber: string; callType: string;
    callTime: string; duration?: number; content?: string;
  }) {
    return { data: await this.service.ingest(body) };
  }

  @Get()
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async list(@Query() query: PaginationQueryDto, @Query('matchStatus') matchStatus?: string) {
    return this.service.list({ ...query, matchStatus });
  }

  @Get('unmatched')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async listUnmatched(@Query('limit') limit?: number, @Query('cursor') cursor?: string) {
    return this.service.listUnmatched(limit ?? 20, cursor);
  }

  @Post(':id/match')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async manualMatch(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { entityType: EntityType; entityId: string },
    @CurrentUser() user: any,
  ) {
    return { data: await this.service.manualMatch(id, body.entityType, BigInt(body.entityId), user.id) };
  }
}
