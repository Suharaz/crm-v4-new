import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';

@Module({
  controllers: [LabelsController],
  providers: [LabelsService, PrismaClient],
  exports: [LabelsService],
})
export class LabelsModule {}
