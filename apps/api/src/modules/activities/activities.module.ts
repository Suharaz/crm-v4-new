import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

@Module({
  controllers: [ActivitiesController],
  providers: [ActivitiesService, PrismaClient],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
