import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PaymentTypesController } from './payment-types.controller';
import { PaymentTypesService } from './payment-types.service';

@Module({
  controllers: [PaymentTypesController],
  providers: [PaymentTypesService, PrismaClient],
})
export class PaymentTypesModule {}
