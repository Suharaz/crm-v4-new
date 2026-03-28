import { Controller, Get, Post, Param, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { ImportService } from './import.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('imports')
@Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
export class ImportController {
  constructor(private readonly service: ImportService) {}

  @Post('leads')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req: any, file: any, cb: any) => {
      if (!file.originalname.endsWith('.csv')) {
        return cb(new BadRequestException('Chỉ chấp nhận file CSV'), false);
      }
      cb(null, true);
    },
  }))
  async importLeads(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    if (!file) throw new BadRequestException('Vui lòng upload file CSV');
    const data = await this.service.createImportJob('leads', file, user.id);
    return { data };
  }

  @Post('customers')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req: any, file: any, cb: any) => {
      if (!file.originalname.endsWith('.csv')) {
        return cb(new BadRequestException('Chỉ chấp nhận file CSV'), false);
      }
      cb(null, true);
    },
  }))
  async importCustomers(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    if (!file) throw new BadRequestException('Vui lòng upload file CSV');
    const data = await this.service.createImportJob('customers', file, user.id);
    return { data };
  }

  @Get()
  async list(@CurrentUser() user: any, @Query('limit') limit?: number, @Query('cursor') cursor?: string) {
    return this.service.list(user.id, limit ?? 20, cursor);
  }

  @Get(':id/status')
  async getStatus(@Param('id', ParseBigIntPipe) id: bigint) {
    const data = await this.service.getStatus(id);
    return { data };
  }
}
