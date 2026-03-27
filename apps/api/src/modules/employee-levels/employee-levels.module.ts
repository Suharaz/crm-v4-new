import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EmployeeLevelsController } from './employee-levels.controller';
import { EmployeeLevelsService } from './employee-levels.service';

@Module({
  controllers: [EmployeeLevelsController],
  providers: [EmployeeLevelsService, PrismaClient],
  exports: [EmployeeLevelsService],
})
export class EmployeeLevelsModule {}
