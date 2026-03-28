import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { FileUploadService } from '../file-upload/file-upload.service';

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly fileUpload: FileUploadService,
    @InjectQueue('import') private readonly importQueue: Queue,
  ) {}

  async createImportJob(
    type: 'leads' | 'customers',
    file: { buffer: Buffer; originalname: string; mimetype: string },
    userId: bigint,
  ) {
    // Save file to uploads/imports/
    const { filePath, fileName } = await this.fileUpload.saveFile(
      file.buffer, file.originalname, file.mimetype, 'imports',
    );

    // Create import record
    const job = await this.prisma.importJob.create({
      data: {
        type,
        fileName,
        fileUrl: filePath,
        createdBy: userId,
      },
    });

    // Enqueue BullMQ job
    await this.importQueue.add('process-import', {
      importJobId: job.id.toString(),
      type,
      filePath,
    });

    return job;
  }

  async getStatus(id: bigint) {
    const job = await this.prisma.importJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Không tìm thấy import job');
    return job;
  }

  async list(userId: bigint, limit = 20, cursor?: string) {
    const take = limit + 1;
    const jobs = await this.prisma.importJob.findMany({
      where: { createdBy: userId },
      orderBy: { id: 'desc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: BigInt(cursor) } } : {}),
    });

    const hasMore = jobs.length > limit;
    const data = hasMore ? jobs.slice(0, limit) : jobs;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }
}
