import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';

@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService, PrismaClient],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
