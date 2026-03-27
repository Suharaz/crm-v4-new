import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { LabelsService } from './labels.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('labels')
export class LabelsController {
  constructor(private readonly service: LabelsService) {}

  @Get()
  async list(@Query('category') category?: string) {
    return this.service.list(category);
  }

  @Post()
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async create(@Body() body: { name: string; color?: string; category?: string }) {
    const data = await this.service.create(body);
    return { data };
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { name?: string; color?: string; category?: string; isActive?: boolean },
  ) {
    const data = await this.service.update(id, body);
    return { data };
  }
}
