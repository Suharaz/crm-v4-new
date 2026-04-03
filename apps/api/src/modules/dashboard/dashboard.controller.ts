import { Controller, Get, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { Roles } from '../auth/decorators/roles-required.decorator';

function parseDates(from?: string, to?: string) {
  const now = new Date();
  return {
    dateFrom: from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1),
    dateTo: to ? new Date(to + 'T23:59:59Z') : now,
  };
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('stats')
  async getStats(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getStats(user.id, user.role, dateFrom, dateTo) };
  }

  @Get('lead-funnel')
  async getLeadFunnel(@CurrentUser() user: any) {
    return { data: await this.service.getLeadFunnel(user.id, user.role) };
  }

  @Get('revenue-trend')
  async getRevenueTrend(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getRevenueTrend(user.id, user.role, dateFrom, dateTo) };
  }

  @Get('top-performers')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getTopPerformers(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getTopPerformers(dateFrom, dateTo) };
  }

  @Get('leads-by-source')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getLeadsBySource(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getLeadsBySource(dateFrom, dateTo) };
  }
}
