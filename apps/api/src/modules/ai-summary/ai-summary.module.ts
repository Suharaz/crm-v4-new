import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AiSummaryService } from './ai-summary.service';

@Module({
  providers: [AiSummaryService, PrismaClient],
  exports: [AiSummaryService],
})
export class AiSummaryModule {}
