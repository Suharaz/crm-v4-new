import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({
  controllers: [TeamsController],
  providers: [TeamsService, PrismaClient],
  exports: [TeamsService],
})
export class TeamsModule {}
