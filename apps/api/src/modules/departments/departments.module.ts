import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';

@Module({
  controllers: [DepartmentsController],
  providers: [DepartmentsService, PrismaClient],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
