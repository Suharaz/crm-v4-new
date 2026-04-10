import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { OrderFormatsController } from './order-formats.controller';
import { OrderFormatsService } from './order-formats.service';

@Module({
  controllers: [OrderFormatsController],
  providers: [OrderFormatsService, PrismaClient],
})
export class OrderFormatsModule {}
