// src/calibration/calibration.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { A2lIndexService } from '../a2l-index/a2l-index.service';

// Add this type definition
type ByteOrder = 'MSB_FIRST' | 'MSB_LAST';

interface CalibrationSource {
  a2lPath: string;
  labels: string[];
}

interface CalibrationChange {
  label: string;
  value: number;
  sourceA2l?: string; // which A2L to use for this change
}

@Injectable()
export class CalibrationService {
  constructor(private readonly index: A2lIndexService) {}

  // Merge calibrations from multiple A2Ls, handling overlaps
  async getCalibrationsFromMultipleA2ls(a2lPaths: string[]) {
    const merged = new Map<string, any>();
    const sources = new Map<string, string[]>(); // label -> a2lPaths that define it

    for (const a2lPath of a2lPaths) {
      const calibrations = await this.parseA2lCalibrations(a2lPath);

      for (const [label, def] of calibrations) {
        if (!sources.has(label)) sources.set(label, []);
        sources.get(label)!.push(a2lPath);

        // Keep the first definition, but note alternatives
        if (!merged.has(label)) {
          merged.set(label, { ...def, availableIn: [a2lPath] });
        } else {
          merged.get(label)!.availableIn.push(a2lPath);
        }
      }
    }

    return {
      calibrations: Array.from(merged.entries()).map(([label, def]) => ({
        label,
        ...def,
        hasMultipleSources: def.availableIn.length > 1
      })),
      conflicts: Array.from(sources.entries())
        .filter(([_, paths]) => paths.length > 1)
        .map(([label, paths]) => ({ label, definedIn: paths }))
    };
  }

  // Apply changes using the best A2L for each calibration
  async applyMultiSourceChanges(params: {
    binary: Buffer;
    matchedA2ls: string[]; // from your identification results
    changes: CalibrationChange[];
  }) {
    const patched = Buffer.from(params.binary);
    const report: any[] = [];

    // Group changes by source A2L (auto-select or user-specified)
    const changesByA2l = new Map<string, CalibrationChange[]>();

    for (const change of params.changes) {
      let sourceA2l = change.sourceA2l;

      if (!sourceA2l) {
        // Auto-select: find the A2L that defines this label
        sourceA2l = await this.findBestA2lForLabel(change.label, params.matchedA2ls);
        if (!sourceA2l) {
          throw new BadRequestException(`Label '${change.label}' not found in any matched A2L`);
        }
      }

      if (!changesByA2l.has(sourceA2l)) changesByA2l.set(sourceA2l, []);
      changesByA2l.get(sourceA2l)!.push(change);
    }

    // Apply changes A2L by A2L
    for (const [a2lPath, changes] of changesByA2l) {
      const a2lDefs = await this.parseA2lCalibrations(a2lPath);

      for (const change of changes) {
        const def = a2lDefs.get(change.label);
        if (!def) continue;

        const offset = this.resolveOffset(def);
        const rawValue = this.physToRaw(change.value, def.compu);
        const beforeRaw = this.readRaw(patched, offset, def.sizeBytes, def.byteOrder);

        this.writeRaw(patched, offset, def.sizeBytes, def.byteOrder, BigInt(rawValue));

        report.push({
          label: change.label,
          sourceA2l: a2lPath,
          offset,
          physicalValue: change.value,
          beforeRaw: `0x${beforeRaw.toString(16)}`,
          afterRaw: `0x${rawValue.toString(16)}`,
        });
      }
    }

    await this.fixChecksumsInPlace(patched);
    return { patched, report };
  }

  // Change return type from string | null to string | undefined
  private async findBestA2lForLabel(label: string, candidateA2ls: string[]): Promise<string | undefined> {
    for (const a2lPath of candidateA2ls) {
      const calibrations = await this.parseA2lCalibrations(a2lPath);
      if (calibrations.has(label)) return a2lPath;
    }
    return undefined; // Changed from null to undefined
  }

  // Stub - implement A2L parsing for CHARACTERISTIC blocks
  private async parseA2lCalibrations(a2lPath: string): Promise<Map<string, any>> {
    // TODO: Parse A2L file for CHARACTERISTIC definitions
    // Extract: label, address, size, byte_order, record_layout, compu_method
    return new Map();
  }

  private readRaw(buf: Buffer, offset: number, sizeBytes: number, byteOrder: ByteOrder): bigint {
    let value = 0n;
    if (byteOrder === 'MSB_FIRST') {
      for (let i = 0; i < sizeBytes; i++) {
        value = (value << 8n) | BigInt(buf[offset + i]);
      }
    } else {
      for (let i = sizeBytes - 1; i >= 0; i--) {
        value = (value << 8n) | BigInt(buf[offset + i]);
      }
    }
    return value;
  }

  private writeRaw(buf: Buffer, offset: number, sizeBytes: number, byteOrder: ByteOrder, value: bigint): void {
    if (byteOrder === 'MSB_FIRST') {
      for (let i = sizeBytes - 1; i >= 0; i--) {
        buf[offset + i] = Number(value & 0xffn);
        value >>= 8n;
      }
    } else {
      for (let i = 0; i < sizeBytes; i++) {
        buf[offset + i] = Number(value & 0xffn);
        value >>= 8n;
      }
    }
  }

  private physToRaw(physicalValue: number, compuMethod?: any): number {
    // Implement conversion from physical to raw value
    // For now, return as-is (you'll need to implement based on A2L COMPU_METHOD)
    return Math.round(physicalValue);
  }

  private resolveOffset(def: any): number {
    // Implement address to file offset resolution
    // For now, return address as offset (you'll need A2L memory segment parsing)
    return def.address;
  }

  private async fixChecksumsInPlace(buffer: Buffer): Promise<void> {
    // Implement checksum calculation/fixing for your ECU family
    // This is ECU-specific - you'll need to implement based on your target platform
    console.log('Checksum fixing not implemented - add your ECU-specific logic here');
  }
}
