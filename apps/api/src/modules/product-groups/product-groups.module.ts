import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ProductGroupsController } from './product-groups.controller';
import { ProductGroupsService } from './product-groups.service';

@Module({
  controllers: [ProductGroupsController],
  providers: [ProductGroupsService, PrismaClient],
})
export class ProductGroupsModule {}
