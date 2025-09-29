// src/learning/learning.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningService } from './learning.service';
import { LearningController } from './learning.controller';
import { ComparisonModule } from '../comparison/comparison.module';
import { EcuFamily } from './entities/ecu-family.entity';
import { EcuVariant } from './entities/ecu-variant.entity';
import { ModificationType } from './entities/modification-type.entity';
import { ModificationPattern } from './entities/modification-pattern.entity';
import { ModificationSample } from './entities/modification-sample.entity';
import { ModificationSignature } from './entities/modification-signature.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EcuFamily,
      EcuVariant,
      ModificationType,
      ModificationPattern,
      ModificationSample,
      ModificationSignature,
    ]),
    ComparisonModule,
  ],
  controllers: [LearningController],
  providers: [LearningService],
  exports: [LearningService],
})
export class LearningModule {}
