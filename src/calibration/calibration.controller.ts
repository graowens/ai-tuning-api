// src/calibration/calibration.controller.ts
import { Controller, Post, Get, UseInterceptors, UploadedFile, Body, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { CalibrationService } from './calibration.service';
import type { Express } from 'express';

// Export the interface so it can be used
export interface CalibrationChange {
  label: string;
  value: number;
  sourceA2l?: string;
}

@ApiTags('calibration')
@Controller('calibration')
export class CalibrationController {
  constructor(private readonly calibrationService: CalibrationService) {}

  @Post('modify')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        matchedA2ls: {
          type: 'array',
          items: { type: 'string' }
        },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              value: { type: 'number' },
              sourceA2l: { type: 'string' }
            }
          }
        }
      }
    }
  })
  async modifyCalibrations(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: {
      matchedA2ls: string[];
      changes: CalibrationChange[];
    }
  ) {
    const result = await this.calibrationService.applyMultiSourceChanges({
      binary: file.buffer,
      matchedA2ls: body.matchedA2ls,
      changes: body.changes,
    });

    return {
      success: true,
      report: result.report,
      patchedSize: result.patched.length,
    };
  }

  @Get('available')
  async getAvailableCalibrations(@Query('a2lPaths') a2lPaths: string[]) {
    return this.calibrationService.getCalibrationsFromMultipleA2ls(a2lPaths);
  }
}
