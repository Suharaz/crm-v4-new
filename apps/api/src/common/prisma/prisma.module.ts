import { Global, Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { prisma } from '@crm/database';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    {
      provide: PrismaClient,
      useValue: prisma,
    },
    PrismaService,
  ],
  exports: [PrismaClient],
})
export class PrismaModule {}
