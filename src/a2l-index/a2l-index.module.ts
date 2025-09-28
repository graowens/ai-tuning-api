import { Module } from '@nestjs/common';
import { A2lIndexService } from './a2l-index.service';

@Module({
  providers: [A2lIndexService],
  exports: [A2lIndexService],
})
export class A2lIndexModule {}
