import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaClient, Prisma, UserRole } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { FileUploadService } from '../file-upload/file-upload.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ImportService {
  private readonly uploadDir: string;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly fileUpload: FileUploadService,
    @InjectQueue('import') private readonly importQueue: Queue,
    configService: ConfigService,
  ) {
    this.uploadDir = configService.get('UPLOAD_DIR', './uploads');
  }

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

  async getStatus(id: bigint, user: { id: bigint; role: UserRole }) {
    const job = await this.prisma.importJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Không tìm thấy import job');
    // Ownership check: only the creator or admin/manager can view
    if (user.role === UserRole.USER && job.createdBy !== user.id) {
      throw new ForbiddenException('Không có quyền xem import job này');
    }
    return job;
  }

  /**
   * Resolve absolute path of a job's error CSV for download.
   * Reuses getStatus() for ownership check; validates path traversal.
   */
  async getErrorFilePath(id: bigint, user: { id: bigint; role: UserRole }) {
    const job = await this.getStatus(id, user);
    if (!job.errorFileUrl) {
      throw new NotFoundException('Job này không có file lỗi');
    }

    // Resolve paths and ensure the target stays inside uploadDir (defense against
    // tampered DB values containing '..' or absolute paths).
    const baseDir = path.resolve(this.uploadDir);
    const absolutePath = path.resolve(baseDir, job.errorFileUrl);
    if (absolutePath !== baseDir && !absolutePath.startsWith(baseDir + path.sep)) {
      throw new ForbiddenException('Đường dẫn file không hợp lệ');
    }

    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('File lỗi không còn tồn tại trên server');
    }

    return { absolutePath, downloadName: `import-errors-${id}.csv` };
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
