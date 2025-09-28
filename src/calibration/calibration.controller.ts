// src/calibration/calibration.controller.ts
@Controller('calibration')
export class CalibrationController {
  constructor(private readonly calibrationService: CalibrationService) {}

  @Get('available')
  async getAvailableCalibrations(@Query('a2lPaths') a2lPaths: string[]) {
    return this.calibrationService.getCalibrationsFromMultipleA2ls(a2lPaths);
  }

  @Post('modify')
  @UseInterceptors(FileInterceptor('file'))
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

    // Return the patched file
    return {
      success: true,
      report: result.report,
      // In a real implementation, you'd stream the binary as a download
      patchedSize: result.patched.length,
    };
  }
}
