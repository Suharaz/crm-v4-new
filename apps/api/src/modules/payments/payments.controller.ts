import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { UserRole, PaymentStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get()
  async list(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: PaymentStatus,
    @Query('orderId') orderId?: string,
  ) {
    return this.service.list({ ...query, status, orderId });
  }

  @Get('pending')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async listPending(@Query('limit') limit?: number, @Query('cursor') cursor?: string) {
    return this.service.listPending(limit ?? 20, cursor);
  }

  @Get(':id')
  async findById(@Param('id', ParseBigIntPipe) id: bigint) {
    return { data: await this.service.findById(id) };
  }

  @Post()
  async create(
    @Body() body: { orderId: string; amount: number; paymentTypeId?: string; transferContent?: string },
  ) {
    return { data: await this.service.create(body) };
  }

  @Post(':id/verify')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async verify(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { bankTransactionId?: string },
    @CurrentUser() user: any,
  ) {
    return { data: await this.service.verifyManual(id, user.id, body.bankTransactionId) };
  }

  @Post(':id/reject')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async reject(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    return { data: await this.service.reject(id, user.id) };
  }
}
