import { Controller, Get, Post, Delete, Param, Query, HttpCode } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: any, @Query('limit') limit?: number, @Query('cursor') cursor?: string) {
    return this.service.list(user.id, limit ?? 20, cursor);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: any) {
    const count = await this.service.unreadCount(user.id);
    return { data: { count } };
  }

  @Post(':id/read')
  @HttpCode(200)
  async markAsRead(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    await this.service.markAsRead(id, user.id);
    return { data: { message: 'Đã đọc' } };
  }

  @Post('read-all')
  @HttpCode(200)
  async markAllAsRead(@CurrentUser() user: any) {
    await this.service.markAllAsRead(user.id);
    return { data: { message: 'Đã đọc tất cả' } };
  }

  @Delete('read')
  @HttpCode(200)
  async deleteRead(@CurrentUser() user: any) {
    const result = await this.service.deleteRead(user.id);
    return { data: { deleted: result.count, message: 'Đã xoá thông báo đã đọc' } };
  }
}
