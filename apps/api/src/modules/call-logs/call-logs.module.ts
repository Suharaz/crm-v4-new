import { Module } from '@nestjs/common';
import { CallLogsController } from './call-logs.controller';
import { CallLogsService } from './call-logs.service';
import { AiSummaryModule } from '../ai-summary/ai-summary.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [AiSummaryModule, CustomersModule],
  controllers: [CallLogsController],
  providers: [CallLogsService],
  exports: [CallLogsService],
})
export class CallLogsModule {}
