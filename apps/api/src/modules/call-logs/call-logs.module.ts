import { Module } from '@nestjs/common';
import { CallLogsController } from './call-logs.controller';
import { CallLogsService } from './call-logs.service';
import { AiSummaryModule } from '../ai-summary/ai-summary.module';

@Module({
  imports: [AiSummaryModule],
  controllers: [CallLogsController],
  providers: [CallLogsService],
  exports: [CallLogsService],
})
export class CallLogsModule {}
