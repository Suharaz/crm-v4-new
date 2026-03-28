import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentMatchingService } from './payment-matching.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentMatchingService, PrismaClient],
  exports: [PaymentsService, PaymentMatchingService],
})
export class PaymentsModule {}
