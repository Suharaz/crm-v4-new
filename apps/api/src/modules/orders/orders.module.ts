import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, PrismaClient],
  exports: [OrdersService],
})
export class OrdersModule {}
