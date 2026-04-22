import { Module } from '@nestjs/common';
import { BankTransactionsController } from './bank-transactions.controller';
import { BankTransactionsService } from './bank-transactions.service';
import { BankTransactionImportService } from './bank-transaction-import.service';
import { PaymentMatchingService } from '../payments/payment-matching.service';

@Module({
  controllers: [BankTransactionsController],
  providers: [BankTransactionsService, BankTransactionImportService, PaymentMatchingService],
  exports: [BankTransactionsService],
})
export class BankTransactionsModule {}
