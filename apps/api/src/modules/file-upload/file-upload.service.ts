import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';

const ALLOWED_MIME_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'text/csv',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Injectable()
export class FileUploadService {
  private readonly uploadDir: string;

  constructor(private readonly configService: ConfigService) {
    this.uploadDir = this.configService.get('UPLOAD_DIR', './uploads');
  }

  /**
   * Save uploaded file to local filesystem.
   * Returns relative path from upload root.
   */
  async saveFile(
    buffer: Buffer,
    originalName: string,
    mimetype: string,
    subDir: string = 'attachments',
  ): Promise<{ filePath: string; fileName: string; fileSize: number }> {
    // Validate
    if (buffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException('File vượt quá 10MB');
    }
    if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
      throw new BadRequestException('Loại file không được hỗ trợ');
    }

    // Generate safe filename
    const ext = path.extname(originalName).toLowerCase() || '.bin';
    const uuid = uuidv4();
    const fileName = `${uuid}${ext}`;

    // Organize by year-month
    const now = new Date();
    const monthDir = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dirPath = path.join(this.uploadDir, subDir, monthDir);

    // Ensure directory exists
    fs.mkdirSync(dirPath, { recursive: true });

    // Write file
    const fullPath = path.join(dirPath, fileName);
    fs.writeFileSync(fullPath, buffer);

    // Return relative path
    const filePath = `${subDir}/${monthDir}/${fileName}`;
    return { filePath, fileName: originalName, fileSize: buffer.length };
  }

  /** Get absolute path for a relative file path. */
  getAbsolutePath(relativePath: string): string {
    return path.join(this.uploadDir, relativePath);
  }

  /** Check if file exists. */
  fileExists(relativePath: string): boolean {
    return fs.existsSync(this.getAbsolutePath(relativePath));
  }
}
