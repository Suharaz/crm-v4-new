import { Module } from '@nestjs/common';
import { ThirdPartyApiController } from './third-party-api.controller';

@Module({
  controllers: [ThirdPartyApiController],
  providers: [],
})
export class ThirdPartyApiModule {}
