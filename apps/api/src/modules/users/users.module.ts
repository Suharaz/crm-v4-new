import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, PrismaClient],
  exports: [UsersService],
})
export class UsersModule {}
