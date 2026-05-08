import { Module } from '@nestjs/common';
import { CallLogsController } from './call-logs.controller';
import { CallLogsService } from './call-logs.service';
import { AiSummaryModule } from '../ai-summary/ai-summary.module';
import { CustomersModule } from '../customers/customers.module';
import { UserPhonesModule } from '../user-phones/user-phones.module';

@Module({
  imports: [AiSummaryModule, CustomersModule, UserPhonesModule],
  controllers: [CallLogsController],
  providers: [CallLogsService],
  exports: [CallLogsService],
})
export class CallLogsModule {}
