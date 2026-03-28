import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  controllers: [ExportController],
  providers: [ExportService, PrismaClient],
})
export class ExportModule {}
