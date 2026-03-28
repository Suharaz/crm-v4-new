import { Module, forwardRef } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [forwardRef(() => LeadsModule)],
  controllers: [ActivitiesController],
  providers: [ActivitiesService, PrismaClient],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
