// src/learning/entities/modification-pattern.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ModificationType } from './modification-type.entity';
import { EcuFamily } from './ecu-family.entity';

@Entity('modification_patterns')
export class ModificationPattern {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'modification_type_id' })
  modificationTypeId: number;

  @Column({ name: 'family_id' })
  familyId: number;

  @Column({ name: 'file_offset' })
  fileOffset: number;

  @Column({ name: 'original_value', type: 'bytea' })
  originalValue: Buffer;

  @Column({ name: 'modified_value', type: 'bytea' })
  modifiedValue: Buffer;

  @Column({ name: 'pattern_size', default: 1 })
  patternSize: number;

  @Column({ default: 1 })
  frequency: number;

  @Column({ type: 'float', default: 0.0 })
  confidence: number;

  @Column({ name: 'context_before', type: 'bytea', nullable: true })
  contextBefore: Buffer;

  @Column({ name: 'context_after', type: 'bytea', nullable: true })
  contextAfter: Buffer;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => ModificationType, modType => modType.patterns)
  modificationType: ModificationType;

  @ManyToOne(() => EcuFamily)
  family: EcuFamily;
}
