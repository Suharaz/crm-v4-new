import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerPhonesService } from './customer-phones.service';
import { LabelsModule } from '../labels/labels.module';
import { AiSummaryModule } from '../ai-summary/ai-summary.module';

@Module({
  imports: [LabelsModule, AiSummaryModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerPhonesService],
  exports: [CustomersService, CustomerPhonesService],
})
export class CustomersModule {}
