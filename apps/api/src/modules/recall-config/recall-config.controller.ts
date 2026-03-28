import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RecallConfigService } from './recall-config.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('recall-configs')
@Roles(UserRole.SUPER_ADMIN)
export class RecallConfigController {
  constructor(private readonly service: RecallConfigService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  getById(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.getById(id);
  }

  @Post()
  create(
    @Body() body: { entityType: string; maxDaysInPool: number; autoLabelIds?: string[] },
    @CurrentUser() user: { id: bigint },
  ) {
    const autoLabelIds = (body.autoLabelIds ?? []).map((id) => BigInt(id));
    return this.service.create(
      { entityType: body.entityType, maxDaysInPool: body.maxDaysInPool, autoLabelIds },
      user.id,
    );
  }

  @Patch(':id')
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { maxDaysInPool?: number; autoLabelIds?: string[]; isActive?: boolean },
  ) {
    const autoLabelIds = body.autoLabelIds?.map((lid) => BigInt(lid));
    return this.service.update(id, {
      maxDaysInPool: body.maxDaysInPool,
      autoLabelIds,
      isActive: body.isActive,
    });
  }

  @Delete(':id')
  remove(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.remove(id);
  }

  @Post('run-now')
  runNow() {
    return this.service.runAutoRecall();
  }
}
