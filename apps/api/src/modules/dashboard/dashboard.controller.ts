import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('stats')
  async getStats(@CurrentUser() user: any) {
    return { data: await this.service.getStats(user.id, user.role, user.departmentId) };
  }
}
