// src/learning/entities/modification-signature.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ModificationType } from './modification-type.entity';
import { EcuFamily } from './ecu-family.entity';

@Entity('modification_signatures')
export class ModificationSignature {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'modification_type_id' })
  modificationTypeId: number;

  @Column({ name: 'family_id' })
  familyId: number;

  @Column({ name: 'signature_data', type: 'jsonb' })
  signatureData: any;

  @Column({ name: 'sample_count', default: 0 })
  sampleCount: number;

  @Column({ name: 'accuracy_score', type: 'float', default: 0.0 })
  accuracyScore: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => ModificationType)
  modificationType: ModificationType;

  @ManyToOne(() => EcuFamily)
  family: EcuFamily;
}
