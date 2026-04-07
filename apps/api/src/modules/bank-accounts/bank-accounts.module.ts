import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';

@Module({
  controllers: [BankAccountsController],
  providers: [BankAccountsService, PrismaClient],
})
export class BankAccountsModule {}
