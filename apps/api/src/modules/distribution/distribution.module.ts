import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { DistributionController } from './distribution.controller';
import { DistributionService } from './distribution.service';
import { ScoringService } from './scoring.service';

@Module({
  controllers: [DistributionController],
  providers: [DistributionService, ScoringService, PrismaClient],
  exports: [DistributionService],
})
export class DistributionModule {}
