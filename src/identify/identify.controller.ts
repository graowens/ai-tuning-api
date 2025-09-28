import { Controller, Post, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IdentifyService } from './identify.service';
import type { Express } from 'express';

@ApiTags('identify')
@Controller('identify')
export class IdentifyController {
  constructor(private readonly svc: IdentifyService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  async upload(@UploadedFile() file: Express.Multer.File) {
    return this.svc.identify(file);
  }
}
