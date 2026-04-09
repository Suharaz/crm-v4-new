import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AiSummaryService } from './ai-summary.service';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [SystemSettingsModule],
  providers: [AiSummaryService, PrismaClient],
  exports: [AiSummaryService],
})
export class AiSummaryModule {}
