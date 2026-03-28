import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ThirdPartyApiController } from './third-party-api.controller';

@Module({
  controllers: [ThirdPartyApiController],
  providers: [PrismaClient],
})
export class ThirdPartyApiModule {}
