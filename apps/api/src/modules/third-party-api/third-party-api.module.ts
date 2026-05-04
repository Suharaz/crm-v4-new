import { Module } from '@nestjs/common';
import { ThirdPartyApiController } from './third-party-api.controller';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [CustomersModule], // expose CustomerPhonesService
  controllers: [ThirdPartyApiController],
  providers: [],
})
export class ThirdPartyApiModule {}
