// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IdentifyModule } from './identify/identify.module';
import { A2lIndexModule } from './a2l-index/a2l-index.module';
import { ComparisonModule } from './comparison/comparison.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    A2lIndexModule,
    IdentifyModule,
    ComparisonModule,
  ],
})
export class AppModule {}
