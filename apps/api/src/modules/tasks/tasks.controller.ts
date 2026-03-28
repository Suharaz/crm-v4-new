import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, BadRequestException } from '@nestjs/common';
import { IsOptional, IsEnum } from 'class-validator';
import { TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

class TaskListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}

@Controller('tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  async list(
    @CurrentUser() user: any,
    @Query() query: TaskListQueryDto,
  ) {
    return this.service.list(user.id, query);
  }

  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
      throw new BadRequestException('Tiêu đề công việc không được để trống');
    }
    // Default assignedTo to current user if not provided
    const bodyWithDefaults = { ...body, assignedTo: body.assignedTo ?? user.id.toString() };
    return { data: await this.service.create(bodyWithDefaults, user.id) };
  }

  @Post(':id/complete')
  @HttpCode(200)
  async complete(@Param('id', ParseBigIntPipe) id: bigint) {
    return { data: await this.service.complete(id) };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@Param('id', ParseBigIntPipe) id: bigint) {
    return { data: await this.service.cancel(id) };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    return { data: await this.service.update(id, body, user.id) };
  }

  @Delete(':id')
  async remove(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.remove(id);
    return { data: { success: true } };
  }
}
