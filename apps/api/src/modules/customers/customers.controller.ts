import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerListQueryDto } from './dto/customer-list-query.dto';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { LabelsService } from '../labels/labels.service';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly labelsService: LabelsService,
  ) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async list(@Query() query: CustomerListQueryDto) {
    return this.customersService.list(query);
  }

  @Get('search')
  async searchByPhone(@Query('phone') phone: string) {
    return this.customersService.searchByPhone(phone);
  }

  @Get(':id')
  async findById(@Param('id', ParseBigIntPipe) id: bigint) {
    const data = await this.customersService.findById(id);
    return { data };
  }

  @Post()
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async create(@Body() dto: CreateCustomerDto, @CurrentUser() user: any) {
    const data = await this.customersService.create(dto, user);
    return { data };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: any,
  ) {
    const data = await this.customersService.update(id, body, user);
    return { data };
  }

  @Post(':id/claim')
  @HttpCode(200)
  async claim(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    const data = await this.customersService.claim(id, user);
    return { data };
  }

  @Post(':id/transfer')
  @HttpCode(200)
  async transfer(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { targetType: string; targetDeptId?: string },
    @CurrentUser() user: any,
  ) {
    const data = await this.customersService.transfer(id, body.targetType, body.targetDeptId ?? null, user);
    return { data };
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async reactivate(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    const data = await this.customersService.reactivate(id, user);
    return { data };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async delete(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.customersService.softDelete(id);
    return { data: { message: 'Đã xóa khách hàng' } };
  }

  // Label attach/detach
  @Post(':id/labels')
  async attachLabels(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { labelIds: string[] },
  ) {
    await this.labelsService.attachToCustomer(id, body.labelIds.map(BigInt));
    return { data: { message: 'Đã gắn nhãn' } };
  }

  @Delete(':id/labels/:labelId')
  async detachLabel(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('labelId', ParseBigIntPipe) labelId: bigint,
  ) {
    await this.labelsService.detachFromCustomer(id, labelId);
    return { data: { message: 'Đã gỡ nhãn' } };
  }
}
