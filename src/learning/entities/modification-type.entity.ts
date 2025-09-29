// src/learning/entities/modification-type.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn } from 'typeorm';
import { ModificationPattern } from './modification-pattern.entity';
import { ModificationSample } from './modification-sample.entity';

@Entity('modification_types')
export class ModificationType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'type_name', unique: true })
  typeName: string;

  @Column({ name: 'display_name', nullable: true })
  displayName: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  category: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => ModificationPattern, pattern => pattern.modificationType)
  patterns: ModificationPattern[];

  @OneToMany(() => ModificationSample, sample => sample.modificationType)
  samples: ModificationSample[];
}
