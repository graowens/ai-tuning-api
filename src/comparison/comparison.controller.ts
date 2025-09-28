// src/comparison/comparison.controller.ts
import { Controller, Post, UseInterceptors, UploadedFiles, BadRequestException } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ComparisonService, ComparisonResult } from './comparison.service';
import type { Express } from 'express';

@ApiTags('comparison')
@Controller('comparison')
export class ComparisonController {
  constructor(private readonly comparisonService: ComparisonService) {}

  @Post('compare')
  @UseInterceptors(FilesInterceptor('files', 2, {
    limits: { fileSize: 50 * 1024 * 1024 }
  }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          minItems: 2,
          maxItems: 2
        }
      },
      required: ['files']
    }
  })
  async compareFiles(@UploadedFiles() files: Express.Multer.File[]): Promise<ComparisonResult> {
    if (!files || files.length !== 2) {
      throw new BadRequestException('Exactly 2 files must be uploaded');
    }

    const [file1, file2] = files;

    if (!file1.buffer || !file2.buffer) {
      throw new BadRequestException('Both files must contain data');
    }

    return this.comparisonService.compareFiles(file1, file2);
  }
}
