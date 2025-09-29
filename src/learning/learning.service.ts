// src/learning/learning.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
// Remove this import: import { ComparisonService } from '../comparison/comparison.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { EcuFamily } from './entities/ecu-family.entity';
import { EcuVariant } from './entities/ecu-variant.entity';
import { ModificationType } from './entities/modification-type.entity';
import { ModificationPattern } from './entities/modification-pattern.entity';
import { ModificationSample } from './entities/modification-sample.entity';
import { ModificationSignature } from './entities/modification-signature.entity';

export interface LearningResult {
  processedVariants: number;
  discoveredPatterns: number;
  modificationTypes: string[];
  confidence: number;
  patterns: PatternSummary[];
}

export interface PatternSummary {
  id?: number;
  modType: string;
  offset: number;
  originalValue: Buffer;
  modifiedValue: Buffer;
  frequency: number;
  confidence: number;
}

export interface ApplyModificationRequest {
  sourceFile: Buffer;
  targetModifications: string[]; // ['dpf_off', 'egr_off']
  ecuFamily: string;
  confidenceThreshold?: number;
}

interface FileDifference {
  fileOffset: number;
  file1Value: number;
  file2Value: number;
}

@Injectable()
export class LearningService {
  constructor(
    @InjectRepository(EcuFamily) private ecuFamilyRepo: Repository<EcuFamily>,
    @InjectRepository(EcuVariant) private ecuVariantRepo: Repository<EcuVariant>,
    @InjectRepository(ModificationType) private modTypeRepo: Repository<ModificationType>,
    @InjectRepository(ModificationPattern) private patternRepo: Repository<ModificationPattern>,
    @InjectRepository(ModificationSample) private sampleRepo: Repository<ModificationSample>,
    @InjectRepository(ModificationSignature) private signatureRepo: Repository<ModificationSignature>,
) {}

  async learnFromDataset(datasetPath: string, familyName: string): Promise<LearningResult> {
    console.log(`Starting learning process for ${familyName} at ${datasetPath}`);

    // Create or get ECU family
    let family = await this.ecuFamilyRepo.findOne({ where: { familyName } });
    if (!family) {
      family = await this.ecuFamilyRepo.save({ familyName, description: `Auto-discovered family` });
    }

    const variantFolders = await this.getVariantFolders(datasetPath);
    const discoveredPatterns: PatternSummary[] = [];
    let processedVariants = 0;

    for (const variantFolder of variantFolders) {
      try {
        const patterns = await this.processVariant(family.id, variantFolder);
        discoveredPatterns.push(...patterns);
        processedVariants++;
        console.log(`Processed variant ${path.basename(variantFolder)}: ${patterns.length} patterns`);
      } catch (error) {
        console.error(`Error processing ${variantFolder}:`, error);
      }
    }

    // Analyze and cluster patterns
    await this.analyzePatterns(family.id);

    // Generate signatures
    await this.generateSignatures(family.id);

    const modTypes = [...new Set(discoveredPatterns.map(p => p.modType))];
    const avgConfidence = discoveredPatterns.length > 0
      ? discoveredPatterns.reduce((sum, p) => sum + p.confidence, 0) / discoveredPatterns.length
      : 0;

    return {
      processedVariants,
      discoveredPatterns: discoveredPatterns.length,
      modificationTypes: modTypes,
      confidence: avgConfidence,
      patterns: discoveredPatterns
    };
  }

  private async processVariant(familyId: number, variantPath: string): Promise<PatternSummary[]> {
    const variantName = path.basename(variantPath);
    const files = await fs.readdir(variantPath);

    // Find original file (usually without modification suffix or .bin extension only)
    const originalFile = this.findOriginalFile(files, variantName);
    if (!originalFile) {
      throw new Error(`No original file found in ${variantPath}`);
    }

    const originalBuffer = await fs.readFile(path.join(variantPath, originalFile));
    const originalHash = createHash('sha256').update(originalBuffer).digest('hex');

    // Create or get variant record
    let variant = await this.ecuVariantRepo.findOne({
      where: { familyId, variantName }
    });
    if (!variant) {
      variant = await this.ecuVariantRepo.save({
        familyId,
        variantName,
        originalFileHash: originalHash,
        originalFileSize: originalBuffer.length
      });
    }

    const patterns: PatternSummary[] = [];

    // Process each modified file
    const modifiedFiles = files.filter(f => f !== originalFile && f.endsWith('.bin'));

    for (const modFile of modifiedFiles) {
      const modType = this.extractModificationType(modFile);
      if (!modType) continue;

      const modBuffer = await fs.readFile(path.join(variantPath, modFile));
      const modHash = createHash('sha256').update(modBuffer).digest('hex');

      // Ensure modification type exists
      await this.ensureModificationType(modType);

      // Compare files and extract patterns
      const differences = await this.compareBuffers(originalBuffer, modBuffer);
      const filePatterns = await this.extractPatterns(differences, modType, familyId);

      // Store sample - with null check
      const modTypeEntity = await this.modTypeRepo.findOne({ where: { typeName: modType } });
      if (!modTypeEntity) {
        throw new Error(`Modification type ${modType} not found after creation`);
      }

      await this.sampleRepo.save({
        variantId: variant.id,
        modificationTypeId: modTypeEntity.id,
        modifiedFileHash: modHash,
        differencesCount: differences.length
      });

      patterns.push(...filePatterns);
    }

    return patterns;
  }


  private async extractPatterns(
    differences: FileDifference[],
    modType: string,
    familyId: number
  ): Promise<PatternSummary[]> {
    const patterns: PatternSummary[] = [];
    const modTypeEntity = await this.modTypeRepo.findOne({ where: { typeName: modType } });

    if (!modTypeEntity) {
      throw new Error(`Modification type ${modType} not found`);
    }

    for (const diff of differences) {
      // Get context (16 bytes before and after) - simplified for now
      const contextBefore = Buffer.alloc(16);
      const contextAfter = Buffer.alloc(16);

      const pattern: PatternSummary = {
        modType,
        offset: diff.fileOffset,
        originalValue: Buffer.from([diff.file1Value]),
        modifiedValue: Buffer.from([diff.file2Value]),
        frequency: 1,
        confidence: 0.5, // Initial confidence
      };

      // Check if similar pattern exists
      const existingPattern = await this.patternRepo.findOne({
        where: {
          modificationTypeId: modTypeEntity.id,
          familyId,
          fileOffset: diff.fileOffset,
          originalValue: pattern.originalValue,
          modifiedValue: pattern.modifiedValue
        }
      });

      if (existingPattern) {
        // Update frequency and confidence
        existingPattern.frequency++;
        existingPattern.confidence = Math.min(1.0, existingPattern.confidence + 0.1);
        await this.patternRepo.save(existingPattern);
        pattern.id = existingPattern.id;
        pattern.frequency = existingPattern.frequency;
        pattern.confidence = existingPattern.confidence;
      } else {
        // Create new pattern
        const savedPattern = await this.patternRepo.save({
          modificationTypeId: modTypeEntity.id,
          familyId,
          fileOffset: pattern.offset,
          originalValue: pattern.originalValue,
          modifiedValue: pattern.modifiedValue,
          patternSize: 1,
          frequency: 1,
          confidence: 0.5,
          contextBefore,
          contextAfter
        });
        pattern.id = savedPattern.id;
      }

      patterns.push(pattern);
    }

    return patterns;
  }

  async applyModifications(request: ApplyModificationRequest): Promise<Buffer> {
    const { sourceFile, targetModifications, ecuFamily, confidenceThreshold = 0.7 } = request;

    // Get family
    const family = await this.ecuFamilyRepo.findOne({ where: { familyName: ecuFamily } });
    if (!family) {
      throw new Error(`ECU family ${ecuFamily} not found`);
    }

    // Get patterns for requested modifications
    const modTypes = await this.modTypeRepo.find({
      where: targetModifications.map(typeName => ({ typeName }))
    });

    if (modTypes.length === 0) {
      throw new Error(`No modification types found for: ${targetModifications.join(', ')}`);
    }

    const patterns = await this.patternRepo.find({
      where: {
        familyId: family.id,
        modificationTypeId: modTypes.map(mt => mt.id) as any,
        confidence: MoreThanOrEqual(confidenceThreshold)
      },
      order: { confidence: 'DESC' }
    });

    // Apply patterns to create modified file
    const modifiedFile = Buffer.from(sourceFile);
    let appliedCount = 0;

    for (const pattern of patterns) {
      if (pattern.fileOffset < modifiedFile.length) {
        // Verify original value matches (safety check)
        const currentValue = modifiedFile.subarray(
          pattern.fileOffset,
          pattern.fileOffset + pattern.patternSize
        );

        if (currentValue.equals(pattern.originalValue)) {
          // Apply modification
          pattern.modifiedValue.copy(modifiedFile, pattern.fileOffset);
          appliedCount++;
        }
      }
    }

    console.log(`Applied ${appliedCount} modifications from ${patterns.length} patterns`);
    return modifiedFile;
  }
  async getPatterns(familyName: string, modType: string): Promise<ModificationPattern[]> {
    const family = await this.ecuFamilyRepo.findOne({ where: { familyName } });
    const modTypeEntity = await this.modTypeRepo.findOne({ where: { typeName: modType } });

    if (!family || !modTypeEntity) {
      return [];
    }

    return this.patternRepo.find({
      where: {
        familyId: family.id,
        modificationTypeId: modTypeEntity.id
      },
      order: { confidence: 'DESC' }
    });
  }

  async getSignatures(familyName: string): Promise<ModificationSignature[]> {
    const family = await this.ecuFamilyRepo.findOne({ where: { familyName } });
    if (!family) return [];

    return this.signatureRepo.find({
      where: { familyId: family.id },
      relations: ['modificationType']
    });
  }

  private async analyzePatterns(familyId: number): Promise<void> {
    // Group similar patterns into clusters
    const patterns = await this.patternRepo.find({ where: { familyId } });

    // Simple clustering by modification type and offset proximity
    const clusters = new Map<string, ModificationPattern[]>();

    for (const pattern of patterns) {
      const key = `${pattern.modificationTypeId}_${Math.floor(pattern.fileOffset / 1000)}`;
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key)!.push(pattern);
    }

    // Update confidence based on frequency and clustering
    for (const [key, clusterPatterns] of clusters) {
      const avgFreq = clusterPatterns.reduce((sum, p) => sum + p.frequency, 0) / clusterPatterns.length;

      for (const pattern of clusterPatterns) {
        pattern.confidence = Math.min(1.0, (pattern.frequency / avgFreq) * 0.5 + 0.5);
        await this.patternRepo.save(pattern);
      }
    }
  }

  private async generateSignatures(familyId: number): Promise<void> {
    const modTypes = await this.modTypeRepo.find();

    for (const modType of modTypes) {
      const patterns = await this.patternRepo.find({
        where: { familyId, modificationTypeId: modType.id }
      });

      if (patterns.length === 0) continue;

      const signature = {
        offsetDistribution: this.calculateOffsetDistribution(patterns),
        valuePatterns: this.calculateValuePatterns(patterns),
        frequencyStats: this.calculateFrequencyStats(patterns),
        confidenceStats: this.calculateConfidenceStats(patterns)
      };

      // Check if signature exists
      const existingSignature = await this.signatureRepo.findOne({
        where: { modificationTypeId: modType.id, familyId }
      });

      if (existingSignature) {
        existingSignature.signatureData = signature;
        existingSignature.sampleCount = patterns.length;
        existingSignature.accuracyScore = patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;
        await this.signatureRepo.save(existingSignature);
      } else {
        await this.signatureRepo.save({
          modificationTypeId: modType.id,
          familyId,
          signatureData: signature,
          sampleCount: patterns.length,
          accuracyScore: patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
        });
      }
    }
  }

  // Helper methods
  private findOriginalFile(files: string[], variantName: string): string | null {
    // Look for files that match the variant name exactly or have minimal suffixes
    const candidates = files.filter(f =>
      f.endsWith('.bin') &&
      (f === `${variantName}.bin` ||
        f.includes(variantName) &&
        !f.includes(' - ') &&
        !f.includes('off') &&
        !f.includes('stage'))
    );

    return candidates.length > 0 ? candidates[0] : null;
  }

  private extractModificationType(filename: string): string | null {
    const modTypes = [
      'dpf off', 'dpf_off',
      'egr off', 'egr_off',
      'adblue off', 'adblue_off',
      'lambda off', 'lambda_off',
      'flaps off', 'flaps_off',
      'tva off', 'tva_off',
      'vmax off', 'vmax_off',
      'stop start off', 'stop_start_off'
    ];

    const lowerFilename = filename.toLowerCase();

    for (const modType of modTypes) {
      if (lowerFilename.includes(modType)) {
        return modType.replace(' ', '_');
      }
    }

    return null;
  }

  private async ensureModificationType(typeName: string): Promise<void> {
    const existing = await this.modTypeRepo.findOne({ where: { typeName } });
    if (!existing) {
      const displayName = typeName.replace('_', ' ').replace('off', 'Delete').toUpperCase();
      await this.modTypeRepo.save({
        typeName,
        displayName,
        category: this.categorizeModType(typeName)
      });
    }
  }

  private categorizeModType(typeName: string): string {
    if (typeName.includes('dpf') || typeName.includes('egr') || typeName.includes('adblue')) {
      return 'emissions';
    }
    if (typeName.includes('vmax') || typeName.includes('stage')) {
      return 'performance';
    }
    return 'comfort';
  }

  private async getVariantFolders(datasetPath: string): Promise<string[]> {
    const entries = await fs.readdir(datasetPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(datasetPath, entry.name));
  }

  private async compareBuffers(buf1: Buffer, buf2: Buffer): Promise<FileDifference[]> {
    // Simple byte-by-byte comparison
    const differences: FileDifference[] = [];
    const minLength = Math.min(buf1.length, buf2.length);

    for (let i = 0; i < minLength; i++) {
      if (buf1[i] !== buf2[i]) {
        differences.push({
          fileOffset: i,
          file1Value: buf1[i],
          file2Value: buf2[i]
        });
      }
    }

    return differences;
  }

  private calculateOffsetDistribution(patterns: ModificationPattern[]): any {
    const offsets = patterns.map(p => p.fileOffset);
    return {
      min: Math.min(...offsets),
      max: Math.max(...offsets),
      mean: offsets.reduce((sum, o) => sum + o, 0) / offsets.length,
      count: offsets.length
    };
  }

  private calculateValuePatterns(patterns: ModificationPattern[]): any {
    const transitions = patterns.map(p => ({
      from: p.originalValue[0],
      to: p.modifiedValue[0]
    }));

    return {
      commonTransitions: this.getFrequencyMap(transitions),
      totalTransitions: transitions.length
    };
  }

  private calculateFrequencyStats(patterns: ModificationPattern[]): any {
    const frequencies = patterns.map(p => p.frequency);
    return {
      min: Math.min(...frequencies),
      max: Math.max(...frequencies),
      mean: frequencies.reduce((sum, f) => sum + f, 0) / frequencies.length
    };
  }

  private calculateConfidenceStats(patterns: ModificationPattern[]): any {
    const confidences = patterns.map(p => p.confidence);
    return {
      min: Math.min(...confidences),
      max: Math.max(...confidences),
      mean: confidences.reduce((sum, c) => sum + c, 0) / confidences.length
    };
  }

  private getFrequencyMap(items: any[]): any {
    const map = new Map();
    for (const item of items) {
      const key = JSON.stringify(item);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Object.fromEntries(map);
  }
}
