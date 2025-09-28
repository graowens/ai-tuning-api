// src/comparison/comparison.service.ts
import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { A2lIndexService } from '../a2l-index/a2l-index.service';
import { IdentifyService } from '../identify/identify.service';

export interface BinaryDifference {
  address: number;
  fileOffset: number;
  file1Value: number;
  file2Value: number;
  file1Hex: string;
  file2Hex: string;
  file1Binary: string;
  file2Binary: string;
  a2lContext?: A2lContext;
}

export interface A2lContext {
  calibrationLabel?: string;
  description?: string;
  physicalValue1?: number;
  physicalValue2?: number;
  unit?: string;
  compuMethod?: string;
  recordLayout?: string;
  isWithinCalibration: boolean;
  calibrationStartOffset?: number;
  calibrationSize?: number;
  sourceA2l?: string; // Which A2L file defined this calibration
  availableInA2ls?: string[]; // All A2L files that define this calibration
  searchedA2ls?: string[]; // A2L files that were searched (for unmatched changes)
  primaryA2l?: string; // The primary A2L used for analysis
}

export interface A2lAnalysis {
  calibrationsChanged: CalibrationChange[];
  unknownChanges: number;
  analysisSource: string;
  searchedA2ls: string[];
}

export interface CalibrationChange {
  label: string;
  description?: string;
  startOffset: number;
  size: number;
  changedBytes: number;
  physicalBefore?: number;
  physicalAfter?: number;
  unit?: string;
  changeType: 'value' | 'partial' | 'unknown';
  sourceA2l?: string;
}

interface BinaryComparison {
  sizesMatch: boolean;
  percentageSame: number;
  totalDifferences: number;
  differences: BinaryDifference[];
  a2lAnalysis?: A2lAnalysis;
}

export interface ComparisonResult {
  file1: {
    size: number;
    sha1: string;
    matches: any[];
  };
  file2: {
    size: number;
    sha1: string;
    matches: any[];
  };
  comparison: BinaryComparison;
}

@Injectable()
export class ComparisonService {
  constructor(
    private readonly identifyService: IdentifyService,
    private readonly indexService: A2lIndexService
  ) {}

  async compareFiles(file1: Express.Multer.File, file2: Express.Multer.File): Promise<ComparisonResult> {
    const buf1 = file1.buffer;
    const buf2 = file2.buffer;

    // Get file info and A2L matches
    const file1Info = await this.getFileInfo(file1);
    const file2Info = await this.getFileInfo(file2);

    // Compare binaries
    const comparison = this.performBinaryComparison(buf1, buf2);

    // Get all unique A2L matches
    const allA2lMatches = [...new Set([
      ...file1Info.matches.map(m => m.a2lPath),
      ...file2Info.matches.map(m => m.a2lPath)
    ])];

    // Enhance with A2L analysis if we have matches
    const bestA2l = this.selectBestA2lForAnalysis(file1Info.matches, file2Info.matches);
    if (bestA2l && allA2lMatches.length > 0) {
      comparison.a2lAnalysis = await this.performA2lAnalysis(
        buf1, buf2, comparison.differences, bestA2l, allA2lMatches
      );

      // Enhance individual differences with A2L context from all matched A2Ls
      comparison.differences = await this.enhanceDifferencesWithA2l(
        comparison.differences, bestA2l, allA2lMatches
      );
    }

    return {
      file1: file1Info,
      file2: file2Info,
      comparison
    };
  }

  private async getFileInfo(file: Express.Multer.File) {
    const sha1 = createHash('sha1').update(file.buffer).digest('hex');
    const identifyResult = await this.identifyService.identify(file);

    return {
      size: file.buffer.length,
      sha1,
      matches: identifyResult.matches || []
    };
  }

  private performBinaryComparison(buf1: Buffer, buf2: Buffer): BinaryComparison {
    const minSize = Math.min(buf1.length, buf2.length);
    const maxSize = Math.max(buf1.length, buf2.length);

    const differences: BinaryDifference[] = [];
    let sameBytes = 0;

    // Compare byte by byte up to the smaller file size
    for (let i = 0; i < minSize; i++) {
      const byte1 = buf1[i];
      const byte2 = buf2[i];

      if (byte1 === byte2) {
        sameBytes++;
      } else {
        differences.push({
          address: i,
          fileOffset: i,
          file1Value: byte1,
          file2Value: byte2,
          file1Hex: `0x${byte1.toString(16).padStart(2, '0').toUpperCase()}`,
          file2Hex: `0x${byte2.toString(16).padStart(2, '0').toUpperCase()}`,
          file1Binary: byte1.toString(2).padStart(8, '0'),
          file2Binary: byte2.toString(2).padStart(8, '0')
        });
      }
    }

    // Handle size differences
    if (buf1.length !== buf2.length) {
      const longerBuf = buf1.length > buf2.length ? buf1 : buf2;
      const isFile1Longer = buf1.length > buf2.length;

      for (let i = minSize; i < maxSize; i++) {
        const byte = longerBuf[i];
        differences.push({
          address: i,
          fileOffset: i,
          file1Value: isFile1Longer ? byte : 0,
          file2Value: isFile1Longer ? 0 : byte,
          file1Hex: isFile1Longer ? `0x${byte.toString(16).padStart(2, '0').toUpperCase()}` : '0x00 (missing)',
          file2Hex: isFile1Longer ? '0x00 (missing)' : `0x${byte.toString(16).padStart(2, '0').toUpperCase()}`,
          file1Binary: isFile1Longer ? byte.toString(2).padStart(8, '0') : '00000000 (missing)',
          file2Binary: isFile1Longer ? '00000000 (missing)' : byte.toString(2).padStart(8, '0')
        });
      }
    }

    const percentageSame = maxSize > 0 ? (sameBytes / maxSize) * 100 : 100;

    return {
      sizesMatch: buf1.length === buf2.length,
      percentageSame: Math.round(percentageSame * 100) / 100,
      totalDifferences: differences.length,
      differences: differences.slice(0, 1000) // Limit for performance
    };
  }

  private selectBestA2lForAnalysis(matches1: any[], matches2: any[]): string | null {
    // Prefer matches from file1, then file2, pick highest scoring
    const allMatches = [...matches1, ...matches2].sort((a, b) => b.score - a.score);
    return allMatches.length > 0 ? allMatches[0].a2lPath : null;
  }

  private async performA2lAnalysis(
    buf1: Buffer,
    buf2: Buffer,
    differences: BinaryDifference[],
    a2lPath: string,
    allA2lMatches: string[]
  ): Promise<A2lAnalysis> {
    // Parse all A2L files
    const allCalibrations = new Map<string, any[]>();
    for (const a2l of allA2lMatches) {
      allCalibrations.set(a2l, await this.parseA2lCalibrations(a2l));
    }

    const calibrationsChanged: CalibrationChange[] = [];
    let unknownChanges = 0;

    // Group differences by calibration across all A2Ls
    const calibrationDiffs = new Map<string, { diffs: BinaryDifference[], sourceA2l: string, cal: any }>();

    for (const diff of differences) {
      let found = false;

      // Search in primary A2L first, then others
      const searchOrder = [a2lPath, ...allA2lMatches.filter(a => a !== a2lPath)];

      for (const searchA2l of searchOrder) {
        const calibrations = allCalibrations.get(searchA2l) || [];
        const cal = this.findCalibrationForOffset(diff.fileOffset, calibrations);

        if (cal) {
          const key = `${cal.label}_${searchA2l}`;
          if (!calibrationDiffs.has(key)) {
            calibrationDiffs.set(key, { diffs: [], sourceA2l: searchA2l, cal });
          }
          calibrationDiffs.get(key)!.diffs.push(diff);
          found = true;
          break;
        }
      }

      if (!found) {
        unknownChanges++;
      }
    }

    // Analyze each changed calibration
    for (const [key, { diffs, sourceA2l, cal }] of calibrationDiffs) {
      const change: CalibrationChange = {
        label: cal.label,
        description: cal.description,
        startOffset: cal.fileOffset,
        size: cal.sizeBytes,
        changedBytes: diffs.length,
        changeType: this.determineChangeType(diffs, cal),
        unit: cal.unit,
        sourceA2l: sourceA2l
      };

      // Try to calculate physical values if it's a simple value change
      if (change.changeType === 'value' && cal.compuMethod) {
        change.physicalBefore = this.rawToPhysical(
          this.readCalibrationValue(buf1, cal), cal.compuMethod
        );
        change.physicalAfter = this.rawToPhysical(
          this.readCalibrationValue(buf2, cal), cal.compuMethod
        );
      }

      calibrationsChanged.push(change);
    }

    return {
      calibrationsChanged,
      unknownChanges,
      analysisSource: a2lPath,
      searchedA2ls: allA2lMatches
    };
  }

  private async enhanceDifferencesWithA2l(
    differences: BinaryDifference[],
    a2lPath: string,
    allA2lMatches: string[]
  ): Promise<BinaryDifference[]> {
    // Parse all A2L files
    const allCalibrations = new Map<string, any[]>();
    for (const a2l of allA2lMatches) {
      allCalibrations.set(a2l, await this.parseA2lCalibrations(a2l));
    }

    return differences.map(diff => {
      // Search in primary A2L first, then others
      const searchOrder = [a2lPath, ...allA2lMatches.filter(a => a !== a2lPath)];

      for (const searchA2l of searchOrder) {
        const calibrations = allCalibrations.get(searchA2l) || [];
        const cal = this.findCalibrationForOffset(diff.fileOffset, calibrations);

        if (cal) {
          const a2lContext: A2lContext = {
            calibrationLabel: cal.label,
            description: cal.description,
            unit: cal.unit,
            compuMethod: cal.compuMethod?.kind || 'unknown',
            recordLayout: cal.recordLayout,
            isWithinCalibration: true,
            calibrationStartOffset: cal.fileOffset,
            calibrationSize: cal.sizeBytes,
            sourceA2l: searchA2l,
            availableInA2ls: this.findA2lsContainingCalibration(cal.label, allCalibrations),
            primaryA2l: a2lPath
          };

          // Try to convert to physical values if possible
          if (cal.compuMethod && cal.sizeBytes <= 4) {
            try {
              a2lContext.physicalValue1 = this.rawToPhysical(diff.file1Value, cal.compuMethod);
              a2lContext.physicalValue2 = this.rawToPhysical(diff.file2Value, cal.compuMethod);
            } catch {
              // Ignore conversion errors
            }
          }

          return { ...diff, a2lContext };
        }
      }

      // Not found in any A2L
      return {
        ...diff,
        a2lContext: {
          isWithinCalibration: false,
          searchedA2ls: allA2lMatches,
          primaryA2l: a2lPath
        }
      };
    });
  }

  private findA2lsContainingCalibration(label: string, allCalibrations: Map<string, any[]>): string[] {
    const result: string[] = [];
    for (const [a2lPath, calibrations] of allCalibrations) {
      if (calibrations.some(cal => cal.label === label)) {
        result.push(a2lPath);
      }
    }
    return result;
  }

  // Stub implementations - you'll need to implement these based on A2L parsing
  private async parseA2lCalibrations(a2lPath: string): Promise<any[]> {
    // TODO: Parse A2L CHARACTERISTIC blocks
    // Return array of: { label, fileOffset, sizeBytes, description, unit, compuMethod, recordLayout }
    return [];
  }

  private findCalibrationForOffset(offset: number, calibrations: any[]): any | null {
    return calibrations.find(cal =>
      offset >= cal.fileOffset && offset < cal.fileOffset + cal.sizeBytes
    ) || null;
  }

  private determineChangeType(diffs: BinaryDifference[], calibration: any): 'value' | 'partial' | 'unknown' {
    if (diffs.length === calibration.sizeBytes) return 'value';
    if (diffs.length < calibration.sizeBytes) return 'partial';
    return 'unknown';
  }

  private readCalibrationValue(buf: Buffer, calibration: any): number {
    // TODO: Read multi-byte value respecting byte order
    return buf[calibration.fileOffset];
  }

  private rawToPhysical(rawValue: number, compuMethod: any): number {
    // TODO: Implement COMPU_METHOD conversion
    return rawValue;
  }
}
