import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaClient } from '@prisma/client';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { ImportProcessor } from './import.processor';
import { FileUploadModule } from '../file-upload/file-upload.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'import' }),
    FileUploadModule,
  ],
  controllers: [ImportController],
  providers: [ImportService, ImportProcessor, PrismaClient],
})
export class ImportModule {}
