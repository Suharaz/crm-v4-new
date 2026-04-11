import { Controller, Get, Post, Body, Param, Query, HttpCode, BadRequestException, Res, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsEnum, IsString } from 'class-validator';
import { UserRole, PaymentStatus } from '@prisma/client';
import { Response } from 'express';
import { PaymentsService } from './payments.service';
import { PaymentImportService } from './payment-import.service';
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

  @IsOptional()
  @IsString()
  paymentTypeId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly service: PaymentsService,
    private readonly importService: PaymentImportService,
  ) {}

  @Get()
  async list(@Query() query: PaymentListQueryDto) {
    return this.service.list(query);
  }

  @Get('pending')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async listPending(@Query('limit') limit?: number, @Query('cursor') cursor?: string) {
    return this.service.listPending(limit ?? 20, cursor);
  }

  @Get('export')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async exportExcel(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Res() res?: Response,
  ) {
    const buffer = await this.service.exportVerified(dateFrom, dateTo);
    res!.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res!.setHeader('Content-Disposition', 'attachment; filename=payments-verified.xlsx');
    res!.send(buffer);
  }

  @Get('import-template')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.importService.generateTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=payment-import-template.xlsx');
    res.send(buffer);
  }

  @Post('import')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req: any, file: any, cb: any) => {
      if (!file.originalname.match(/\.(xlsx|xls)$/i)) {
        return cb(new BadRequestException('Chỉ chấp nhận file Excel (.xlsx, .xls)'), false);
      }
      cb(null, true);
    },
  }))
  async importExcel(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    if (!file) throw new BadRequestException('Vui lòng upload file Excel');
    const result = await this.importService.importFromExcel(file.buffer, user.id);
    return { data: result };
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
