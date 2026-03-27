import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LabelsModule } from '../labels/labels.module';

@Module({
  imports: [LabelsModule],
  controllers: [LeadsController],
  providers: [LeadsService, PrismaClient],
  exports: [LeadsService],
})
export class LeadsModule {}
