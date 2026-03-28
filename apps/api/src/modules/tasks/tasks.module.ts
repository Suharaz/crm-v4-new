import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, PrismaClient],
})
export class TasksModule {}
