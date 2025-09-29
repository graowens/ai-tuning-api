// src/learning/entities/ecu-family.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { EcuVariant } from './ecu-variant.entity';

@Entity('ecu_families')
export class EcuFamily {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'family_name' })
  familyName: string;

  @Column({ nullable: true })
  description: string;

  @Column({ name: 'created_at', default: () => 'NOW()' })
  createdAt: Date;

  @OneToMany(() => EcuVariant, variant => variant.family)
  variants: EcuVariant[];
}