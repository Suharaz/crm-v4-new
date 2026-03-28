import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AssignmentTemplatesController } from './assignment-templates.controller';
import { AssignmentTemplatesService } from './assignment-templates.service';

@Module({
  controllers: [AssignmentTemplatesController],
  providers: [AssignmentTemplatesService, PrismaClient],
  exports: [AssignmentTemplatesService],
})
export class AssignmentTemplatesModule {}
