import {
  Controller, Get, Post, Body, Param, Query, Res,
  HttpCode, BadRequestException, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { IsOptional, IsString } from 'class-validator';
import { UserRole } from '@prisma/client';
import { BankTransactionsService } from './bank-transactions.service';
import { BankTransactionImportService } from './bank-transaction-import.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { Public } from '../auth/decorators/public-route.decorator';
import { ApiKeyAuth } from '../auth/decorators/api-key-auth.decorator';
import { WebhookSignatureGuard } from '../auth/guards/webhook-signature.guard';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

class BankTransactionListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  matchStatus?: string;
}

@Controller()
export class BankTransactionsController {
  constructor(
    private readonly service: BankTransactionsService,
    private readonly importService: BankTransactionImportService,
  ) {}

  /** Webhook endpoint for bank transaction ingestion — requires x-api-key + HMAC signature. */
  @Public()
  @ApiKeyAuth()
  @UseGuards(WebhookSignatureGuard)
  @Post('webhooks/bank-transactions')
  async ingest(@Body() body: {
    externalId: string; amount: number; content: string;
    bankAccount?: string; senderName?: string; senderAccount?: string;
    transactionTime?: string; rawData?: Record<string, unknown>;
  }) {
    return { data: await this.service.ingest(body) };
  }

  @Get('bank-transactions/import/template')
  @Roles(UserRole.SUPER_ADMIN)
  downloadTemplate(@Res() res: Response) {
    const buffer = this.importService.generateTemplate();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="bank-transaction-template.csv"');
    res.send(buffer);
  }

  @Post('bank-transactions/import')
  @Roles(UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req: any, file: any, cb: any) => {
      const okMime = ['text/csv', 'application/vnd.ms-excel', 'text/plain'].includes(file.mimetype);
      const okExt = /\.csv$/i.test(file.originalname);
      if (!okMime && !okExt) return cb(new BadRequestException('Chỉ chấp nhận file CSV (.csv)'), false);
      cb(null, true);
    },
  }))
  async importCsv(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Vui lòng upload file CSV');
    return { data: await this.importService.importFromCsv(file.buffer) };
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
