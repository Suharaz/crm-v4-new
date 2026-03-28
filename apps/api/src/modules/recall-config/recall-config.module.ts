import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RecallConfigController } from './recall-config.controller';
import { RecallConfigService } from './recall-config.service';

@Module({
  controllers: [RecallConfigController],
  providers: [RecallConfigService, PrismaClient],
})
export class RecallConfigModule {}
