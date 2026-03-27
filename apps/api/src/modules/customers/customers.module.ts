import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { LabelsModule } from '../labels/labels.module';

@Module({
  imports: [LabelsModule],
  controllers: [CustomersController],
  providers: [CustomersService, PrismaClient],
  exports: [CustomersService],
})
export class CustomersModule {}
