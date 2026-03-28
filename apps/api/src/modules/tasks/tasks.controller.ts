import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Controller('tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  async list(
    @CurrentUser() user: any,
    @Query() query: PaginationQueryDto,
    @Query('status') status?: TaskStatus,
  ) {
    return this.service.list(user.id, { ...query, status });
  }

  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    return { data: await this.service.create(body, user.id) };
  }

  @Post(':id/complete')
  async complete(@Param('id', ParseBigIntPipe) id: bigint) {
    return { data: await this.service.complete(id) };
  }

  @Post(':id/cancel')
  async cancel(@Param('id', ParseBigIntPipe) id: bigint) {
    return { data: await this.service.cancel(id) };
  }
}
