import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentMatchingService } from './payment-matching.service';
import { PaymentImportService } from './payment-import.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentMatchingService, PaymentImportService],
  exports: [PaymentsService, PaymentMatchingService, PaymentImportService],
})
export class PaymentsModule {}
