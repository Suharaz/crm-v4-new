import { Controller, Get, Post, Body, Param, Query, HttpCode, BadRequestException } from '@nestjs/common';
import { IsOptional, IsEnum, IsString } from 'class-validator';
import { UserRole, PaymentStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

class PaymentListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsString()
  orderId?: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get()
  async list(@Query() query: PaymentListQueryDto) {
    return this.service.list(query);
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
    @Body() body: {
      orderId: string; amount: number; paymentTypeId?: string; bankAccountId?: string; transferContent?: string;
      transferDate?: string; vatAmount?: number; installmentId?: string;
    },
  ) {
    if (!body.orderId) throw new BadRequestException('orderId là bắt buộc');
    if (body.amount === undefined || body.amount === null) throw new BadRequestException('amount là bắt buộc');
    const createData = {
      ...body,
      transferDate: body.transferDate ? new Date(body.transferDate) : undefined,
      installmentId: body.installmentId ? BigInt(body.installmentId) : undefined,
    };
    return { data: await this.service.create(createData) };
  }

  @Post(':id/verify')
  @HttpCode(200)
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async verify(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { bankTransactionId?: string },
    @CurrentUser() user: any,
  ) {
    return { data: await this.service.verifyManual(id, user.id, body.bankTransactionId) };
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async reject(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    return { data: await this.service.reject(id, user.id) };
  }
}
