import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PaymentInstallmentsController } from './payment-installments.controller';
import { PaymentInstallmentsService } from './payment-installments.service';

@Module({
  controllers: [PaymentInstallmentsController],
  providers: [PaymentInstallmentsService, PrismaClient],
})
export class PaymentInstallmentsModule {}
