import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LabelsModule } from '../labels/labels.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [LabelsModule, CustomersModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
