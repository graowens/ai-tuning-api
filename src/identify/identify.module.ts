// src/identify/identify.module.ts
import { Module } from '@nestjs/common';
import { IdentifyController } from './identify.controller';
import { IdentifyService } from './identify.service';
import { A2lIndexModule } from '../a2l-index/a2l-index.module';

@Module({
  imports: [A2lIndexModule],
  controllers: [IdentifyController],
  providers: [IdentifyService],
  exports: [IdentifyService], // Add this line
})
export class IdentifyModule {}
