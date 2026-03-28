import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, PrismaClient],
  exports: [ProductsService],
})
export class ProductsModule {}
