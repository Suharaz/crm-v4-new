import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';

@Module({
  controllers: [SystemSettingsController],
  providers: [PrismaClient, SystemSettingsService],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
