import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ProductCategoriesController } from './product-categories.controller';
import { ProductCategoriesService } from './product-categories.service';

@Module({
  controllers: [ProductCategoriesController],
  providers: [ProductCategoriesService, PrismaClient],
})
export class ProductCategoriesModule {}
