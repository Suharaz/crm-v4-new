import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { UserRole, OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get()
  async list(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: OrderStatus,
    @Query('customerId') customerId?: string,
    @Query('leadId') leadId?: string,
  ) {
    return this.service.list({ ...query, status, customerId, leadId });
  }

  @Get(':id')
  async findById(@Param('id', ParseBigIntPipe) id: bigint) {
    return { data: await this.service.findById(id) };
  }

  @Post()
  async create(
    @Body() body: { leadId?: string; customerId: string; productId?: string; amount: number; notes?: string },
    @CurrentUser() user: any,
  ) {
    return { data: await this.service.create(body, user.id) };
  }

  @Patch(':id/status')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async updateStatus(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { status: OrderStatus },
  ) {
    return { data: await this.service.updateStatus(id, body.status) };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async delete(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.softDelete(id);
    return { data: { message: 'Đã xóa đơn hàng' } };
  }
}
