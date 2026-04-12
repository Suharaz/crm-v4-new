import { Module } from '@nestjs/common';
import { BankTransactionsController } from './bank-transactions.controller';
import { BankTransactionsService } from './bank-transactions.service';
import { PaymentMatchingService } from '../payments/payment-matching.service';

@Module({
  controllers: [BankTransactionsController],
  providers: [BankTransactionsService, PaymentMatchingService],
  exports: [BankTransactionsService],
})
export class BankTransactionsModule {}
