import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { LeadSourcesController } from './lead-sources.controller';
import { LeadSourcesService } from './lead-sources.service';

@Module({
  controllers: [LeadSourcesController],
  providers: [LeadSourcesService, PrismaClient],
  exports: [LeadSourcesService],
})
export class LeadSourcesModule {}
