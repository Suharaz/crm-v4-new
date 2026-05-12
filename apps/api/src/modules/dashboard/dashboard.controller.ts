import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
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

  @Get('conversion-trend')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getConversionTrend(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getConversionTrend(dateFrom, dateTo) };
  }

  @Get('lead-aging')
  async getLeadAging(@CurrentUser() user: any) {
    return { data: await this.service.getLeadAging(user.id, user.role) };
  }

  @Get('dept-performance')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getDeptPerformance(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getDeptPerformance(dateFrom, dateTo) };
  }

  @Get('team-performance')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getTeamPerformance(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getTeamPerformance(dateFrom, dateTo) };
  }

  @Get('employee-scores')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getEmployeeScores(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('deptId') deptId?: string,
  ) {
    const { dateFrom, dateTo } = parseDates(from, to);
    const departmentId = deptId ? BigInt(deptId) : undefined;
    return { data: await this.service.getEmployeeScores(dateFrom, dateTo, departmentId) };
  }

  @Get('employee-reports/calls')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getEmployeeCallReport(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('deptId') deptId?: string,
  ) {
    const { dateFrom, dateTo } = parseDates(from, to);
    const departmentId = deptId ? BigInt(deptId) : undefined;
    return { data: await this.service.getEmployeeCallReport(dateFrom, dateTo, departmentId) };
  }

  @Get('employee-reports/sales-breakdown')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getEmployeeSalesBreakdown(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('deptId') deptId?: string,
  ) {
    const { dateFrom, dateTo } = parseDates(from, to);
    const departmentId = deptId ? BigInt(deptId) : undefined;
    return { data: await this.service.getEmployeeSalesBreakdown(dateFrom, dateTo, departmentId) };
  }

  @Get('employee-reports/sales-breakdown/customers')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getSalesBreakdownCustomers(
    @Query('userId') userIdStr: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('labelId') labelIdStr?: string,
    @Query('untouched') untouchedStr?: string,
    @Query('other') otherStr?: string,
    @Query('cursor') cursorStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    if (!userIdStr) {
      throw new BadRequestException('userId is required');
    }
    const { dateFrom, dateTo } = parseDates(from, to);
    return {
      data: await this.service.getEmployeeSalesBreakdownCustomers({
        userId: BigInt(userIdStr),
        labelId: labelIdStr ? BigInt(labelIdStr) : undefined,
        untouched: untouchedStr === 'true' || untouchedStr === '1',
        other: otherStr === 'true' || otherStr === '1',
        dateFrom,
        dateTo,
        cursor: cursorStr ? BigInt(cursorStr) : undefined,
        limit: limitStr ? parseInt(limitStr, 10) : undefined,
      }),
    };
  }
}
