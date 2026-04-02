import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('stats')
  async getStats(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    const dateFrom = from ? new Date(from) : undefined;
    const dateTo = to ? new Date(to + 'T23:59:59Z') : undefined;
    return { data: await this.service.getStats(user.id, user.role, dateFrom, dateTo) };
  }

  @Get('lead-funnel')
  async getLeadFunnel(@CurrentUser() user: any) {
    return { data: await this.service.getLeadFunnel(user.id, user.role) };
  }

  @Get('revenue-trend')
  async getRevenueTrend(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    const now = new Date();
    const dateFrom = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const dateTo = to ? new Date(to + 'T23:59:59Z') : now;
    return { data: await this.service.getRevenueTrend(user.id, user.role, dateFrom, dateTo) };
  }
}
