import { Controller, Get, Post, Patch, Delete, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { UserRole, OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

class OrderListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsOptional()
  @IsString()
  format?: string;

  @IsOptional()
  @IsString()
  groupType?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get()
  async list(@Query() query: OrderListQueryDto, @CurrentUser() user: any) {
    // USER role: only see own orders (override createdBy filter)
    const createdByFilter = user.role === UserRole.USER ? BigInt(user.id) : (query.createdBy ? BigInt(query.createdBy) : undefined);
    return this.service.list({ ...query, createdByFilter });
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
    if (!body.customerId) throw new BadRequestException('customerId là bắt buộc');
    if (body.amount === undefined || body.amount === null) throw new BadRequestException('amount là bắt buộc');
    if (typeof body.amount !== 'number' || body.amount <= 0) throw new BadRequestException('amount phải là số dương');
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
