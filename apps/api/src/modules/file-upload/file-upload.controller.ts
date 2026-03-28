import {
  Controller,
  Post,
  Get,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { FileUploadService } from './file-upload.service';
import { Public } from '../auth/decorators/public-route.decorator';

@Controller('files')
export class FileUploadController {
  constructor(private readonly service: FileUploadService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file để tải lên');
    }

    const data = await this.service.saveFile(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    return { data };
  }

  @Get('*')
  @Public()
  async serveFile(
    @Param('0') filePath: string,
    @Res() res: Response,
  ) {
    if (!filePath) {
      throw new NotFoundException('Không tìm thấy file');
    }

    if (!this.service.fileExists(filePath)) {
      throw new NotFoundException('Không tìm thấy file');
    }

    const absolutePath = this.service.getAbsolutePath(filePath);
    res.sendFile(absolutePath);
  }
}
