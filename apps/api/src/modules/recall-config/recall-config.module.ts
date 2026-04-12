import { Module } from '@nestjs/common';
import { RecallConfigController } from './recall-config.controller';
import { RecallConfigService } from './recall-config.service';

@Module({
  controllers: [RecallConfigController],
  providers: [RecallConfigService],
})
export class RecallConfigModule {}
