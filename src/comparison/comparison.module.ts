// src/comparison/comparison.module.ts
import { Module } from '@nestjs/common';
import { ComparisonController } from './comparison.controller';
import { ComparisonService } from './comparison.service';
import { A2lIndexModule } from '../a2l-index/a2l-index.module';
import { IdentifyModule } from '../identify/identify.module';

@Module({
  imports: [A2lIndexModule, IdentifyModule],
  controllers: [ComparisonController],
  providers: [ComparisonService],
})
export class ComparisonModule {}
