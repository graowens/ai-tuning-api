// src/learning/entities/ecu-variant.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn } from 'typeorm';
import { EcuFamily } from './ecu-family.entity';
import { ModificationSample } from './modification-sample.entity';

@Entity('ecu_variants')
export class EcuVariant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'family_id' })
  familyId: number;

  @Column({ name: 'variant_name' })
  variantName: string;

  @Column({ name: 'original_file_hash', nullable: true })
  originalFileHash: string;

  @Column({ name: 'original_file_size', nullable: true })
  originalFileSize: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => EcuFamily, family => family.variants)
  family: EcuFamily;

  @OneToMany(() => ModificationSample, sample => sample.variant)
  samples: ModificationSample[];
}
