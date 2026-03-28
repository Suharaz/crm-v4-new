import { Controller, Get, Post, Patch, Body, Param, HttpCode } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { DistributionService } from './distribution.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('distribution')
@Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
export class DistributionController {
  constructor(private readonly service: DistributionService) {}

  @Get('config/:deptId')
  async getConfig(@Param('deptId', ParseBigIntPipe) deptId: bigint) {
    return { data: await this.service.getConfig(deptId) };
  }

  @Patch('config/:deptId')
  @Roles(UserRole.SUPER_ADMIN)
  async updateConfig(
    @Param('deptId', ParseBigIntPipe) deptId: bigint,
    @Body() body: { isActive?: boolean; weightConfig?: Record<string, number> },
  ) {
    return { data: await this.service.updateConfig(deptId, body) };
  }

  @Get('scores/:deptId')
  async getScores(@Param('deptId', ParseBigIntPipe) deptId: bigint) {
    return { data: await this.service.getScores(deptId) };
  }

  @Post('distribute/:deptId')
  @HttpCode(200)
  async batchDistribute(
    @Param('deptId', ParseBigIntPipe) deptId: bigint,
    @CurrentUser() user: any,
  ) {
    return { data: await this.service.batchDistribute(deptId, user.id) };
  }
}
