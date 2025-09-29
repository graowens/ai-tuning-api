// src/learning/entities/modification-sample.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { EcuVariant } from './ecu-variant.entity';
import { ModificationType } from './modification-type.entity';

@Entity('modification_samples')
export class ModificationSample {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'variant_id' })
  variantId: number;

  @Column({ name: 'modification_type_id' })
  modificationTypeId: number;

  @Column({ name: 'modified_file_hash' })
  modifiedFileHash: string;

  @Column({ name: 'differences_count' })
  differencesCount: number;

  @Column({ name: 'confidence_score', type: 'float', default: 0.0 })
  confidenceScore: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => EcuVariant, variant => variant.samples)
  variant: EcuVariant;

  @ManyToOne(() => ModificationType, modType => modType.samples)
  modificationType: ModificationType;
}
