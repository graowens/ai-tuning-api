// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { IdentifyModule } from './identify/identify.module';
import { A2lIndexModule } from './a2l-index/a2l-index.module';
import { ComparisonModule } from './comparison/comparison.module';
import { LearningModule } from './learning/learning.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_DATABASE || 'ecu_tuning',
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production', // Only for development
    }),
    MulterModule.register({
      dest: './uploads',
    }),
    IdentifyModule,
    A2lIndexModule,
    ComparisonModule,
    LearningModule,
  ],
})
export class AppModule {}
