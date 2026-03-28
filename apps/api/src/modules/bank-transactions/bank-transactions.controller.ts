import { Controller, Get, Post, Body, Param, Query, HttpCode, BadRequestException } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { UserRole } from '@prisma/client';
import { BankTransactionsService } from './bank-transactions.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { Public } from '../auth/decorators/public-route.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

class BankTransactionListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  matchStatus?: string;
}

@Controller()
export class BankTransactionsController {
  constructor(private readonly service: BankTransactionsService) {}

  /** Webhook endpoint for bank transaction ingestion (API key auth - simplified to Public for now). */
  @Public()
  @Post('webhooks/bank-transactions')
  async ingest(@Body() body: {
    externalId: string; amount: number; content: string;
    bankAccount?: string; senderName?: string; senderAccount?: string;
    transactionTime: string; rawData?: Record<string, unknown>;
  }) {
    return { data: await this.service.ingest(body) };
  }

  @Get('bank-transactions')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async list(@Query() query: BankTransactionListQueryDto) {
    return this.service.list(query);
  }

  @Get('bank-transactions/unmatched')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async listUnmatched(@Query('limit') limit?: number, @Query('cursor') cursor?: string) {
    return this.service.listUnmatched(limit ?? 20, cursor);
  }

  @Post('bank-transactions/:id/match')
  @HttpCode(200)
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async manualMatch(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { paymentId: string },
    @CurrentUser() user: any,
  ) {
    if (!body.paymentId) throw new BadRequestException('paymentId là bắt buộc');
    return { data: await this.service.manualMatch(id, BigInt(body.paymentId), user.id) };
  }
}
