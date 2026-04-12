import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, PrismaClient],
  exports: [DashboardService],
})
export class DashboardModule {}
