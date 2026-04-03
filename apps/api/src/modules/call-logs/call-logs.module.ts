import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CallLogsController } from './call-logs.controller';
import { CallLogsService } from './call-logs.service';
import { AiSummaryModule } from '../ai-summary/ai-summary.module';

@Module({
  imports: [AiSummaryModule],
  controllers: [CallLogsController],
  providers: [CallLogsService, PrismaClient],
  exports: [CallLogsService],
})
export class CallLogsModule {}
