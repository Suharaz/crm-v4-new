import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentMatchingService } from './payment-matching.service';
import { PaymentImportService } from './payment-import.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentMatchingService, PaymentImportService, PrismaClient],
  exports: [PaymentsService, PaymentMatchingService, PaymentImportService],
})
export class PaymentsModule {}
