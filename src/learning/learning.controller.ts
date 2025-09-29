// src/learning/learning.controller.ts
import { Controller, Post, Get, Body, Param, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { LearningService, ApplyModificationRequest } from './learning.service';

@ApiTags('learning')
@Controller('learning')
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  @Post('learn-dataset')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        datasetPath: { type: 'string' },
        familyName: { type: 'string' }
      }
    }
  })
  async learnFromDataset(@Body() body: { datasetPath: string; familyName: string }) {
    return this.learningService.learnFromDataset(body.datasetPath, body.familyName);
  }

  @Post('apply-modifications')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  async applyModifications(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: {
      targetModifications: string[];
      ecuFamily: string;
      confidenceThreshold?: number;
    }
  ) {
    const request: ApplyModificationRequest = {
      sourceFile: file.buffer,
      targetModifications: body.targetModifications,
      ecuFamily: body.ecuFamily,
      confidenceThreshold: body.confidenceThreshold
    };

    const modifiedBuffer = await this.learningService.applyModifications(request);

    return {
      success: true,
      originalSize: file.buffer.length,
      modifiedSize: modifiedBuffer.length,
      appliedModifications: body.targetModifications,
      // Return the modified file as base64 or save to temp location
      modifiedFile: modifiedBuffer.toString('base64')
    };
  }

  @Get('patterns/:familyName/:modType')
  async getPatterns(
    @Param('familyName') familyName: string,
    @Param('modType') modType: string
  ) {
    return this.learningService.getPatterns(familyName, modType);
  }

  @Get('signatures/:familyName')
  async getSignatures(@Param('familyName') familyName: string) {
    return this.learningService.getSignatures(familyName);
  }
}
