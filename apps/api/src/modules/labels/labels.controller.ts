import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { LabelsService } from './labels.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

interface LabelBody {
  name?: string;
  color?: string;
  textColor?: string;
  category?: string;
  isActive?: boolean;
  /** Auto-recall window in MINUTES. null = remove config, number = upsert. SUPER_ADMIN only. */
  recallMinutes?: number | null;
}

@Controller('labels')
export class LabelsController {
  constructor(private readonly service: LabelsService) {}

  @Get()
  async list(@Query('category') category?: string) {
    return this.service.list(category);
  }

  @Post()
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async create(
    @Body() body: LabelBody & { name: string },
    @CurrentUser() user: { id: bigint; role: UserRole },
  ) {
    const data = await this.service.create(body, user);
    return { data };
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: LabelBody,
    @CurrentUser() user: { id: bigint; role: UserRole },
  ) {
    const data = await this.service.update(id, body, user);
    return { data };
  }

  @Delete(':id')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async deactivate(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.deactivate(id);
    return { data: { message: 'Đã vô hiệu hóa nhãn' } };
  }
}
