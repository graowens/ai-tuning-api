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
  comparison: {
    sizesMatch: boolean;
    percentageSame: number;
    totalDifferences: number;
    differences: BinaryDifference[];
  };
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

  private performBinaryComparison(buf1: Buffer, buf2: Buffer) {
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
          address: i, // file offset as address for now
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
      differences: differences.slice(0, 1000) // Limit to first 1000 differences for performance
    };
  }

  // Add this method to ComparisonService
  private async enhanceWithA2lAddresses(differences: BinaryDifference[], a2lMatches: any[]) {
    if (!a2lMatches.length) return differences;

    // Use the best matching A2L
    const bestA2l = a2lMatches[0];
    // TODO: Parse A2L memory segments to convert file offsets to ECU addresses

    return differences.map(diff => ({
      ...diff,
      ecuAddress: this.fileOffsetToEcuAddress(diff.fileOffset, bestA2l.a2lPath)
    }));
  }

  private fileOffsetToEcuAddress(fileOffset: number, a2lPath: string): number {
    // TODO: Implement A2L memory segment parsing
    // For now, return file offset as placeholder
    return fileOffset;
  }


}


