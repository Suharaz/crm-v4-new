import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService, PrismaClient],
})
export class SearchModule {}
