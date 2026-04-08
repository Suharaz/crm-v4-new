import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, BadRequestException } from '@nestjs/common';
import { UserRole, LeadStatus } from '@prisma/client';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadListQueryDto } from './dto/lead-list-query.dto';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { LabelsService } from '../labels/labels.service';

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly labelsService: LabelsService,
  ) {}

  @Get()
  async list(@Query() query: LeadListQueryDto, @CurrentUser() user: any) {
    return this.leadsService.list(query, user);
  }

  @Get('my-dept-pool')
  async myDeptPool(
    @CurrentUser() user: any,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.leadsService.myDeptPool(user, limit ?? 20, cursor);
  }

  // 4 Kho endpoints
  @Get('pool/new')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async poolNew(@Query('limit') limit?: number, @Query('cursor') cursor?: string) {
    return this.leadsService.poolNewFiltered(limit ?? 20, cursor);
  }

  @Get('pool/zoom')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async poolZoom(@Query('limit') limit?: number, @Query('cursor') cursor?: string) {
    return this.leadsService.poolZoom(limit ?? 20, cursor);
  }

  @Get('pool/department/:deptId')
  async poolDepartment(
    @Param('deptId', ParseBigIntPipe) deptId: bigint,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.leadsService.poolDepartment(deptId, limit ?? 20, cursor);
  }

  @Get('pool/floating')
  async poolFloating(@Query('limit') limit?: number, @Query('cursor') cursor?: string) {
    return this.leadsService.poolFloating(limit ?? 20, cursor);
  }

  @Get(':id')
  async findById(@Param('id', ParseBigIntPipe) id: bigint) {
    const data = await this.leadsService.findById(id);
    return { data };
  }

  @Post()
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async create(@Body() dto: CreateLeadDto, @CurrentUser() user: any) {
    const data = await this.leadsService.create(dto, user);
    return { data };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: any,
  ) {
    const data = await this.leadsService.update(id, body, user);
    return { data };
  }

  @Post('bulk-assign')
  @HttpCode(200)
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async bulkAssign(
    @Body() body: { leadIds: string[]; userId: string },
    @CurrentUser() user: any,
  ) {
    if (!body.leadIds?.length) throw new BadRequestException('leadIds là bắt buộc');
    if (!body.userId) throw new BadRequestException('userId là bắt buộc');
    return this.leadsService.bulkAssign(
      body.leadIds.map(id => BigInt(id)),
      BigInt(body.userId),
      user,
    );
  }

  @Post(':id/assign')
  @HttpCode(200)
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async assign(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { userId: string },
    @CurrentUser() user: any,
  ) {
    const data = await this.leadsService.assign(id, BigInt(body.userId), user);
    return { data };
  }

  @Post(':id/recall')
  @HttpCode(200)
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async recall(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    const data = await this.leadsService.recall(id, user);
    return { data };
  }

  @Post('bulk-recall')
  @HttpCode(200)
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async bulkRecall(
    @Body() body: { leadIds: string[] },
    @CurrentUser() user: any,
  ) {
    if (!body.leadIds?.length) throw new BadRequestException('leadIds là bắt buộc');
    return this.leadsService.bulkRecall(
      body.leadIds.map(id => BigInt(id)),
      user,
    );
  }

  @Post(':id/claim')
  @HttpCode(200)
  async claim(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    const data = await this.leadsService.claim(id, user);
    return { data };
  }

  @Post(':id/transfer')
  @HttpCode(200)
  async transfer(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { targetType: string; targetDeptId?: string },
    @CurrentUser() user: any,
  ) {
    const data = await this.leadsService.transfer(id, body.targetType, body.targetDeptId ?? null, user);
    return { data };
  }

  @Post(':id/status')
  @HttpCode(200)
  async changeStatus(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { status: LeadStatus },
    @CurrentUser() user: any,
  ) {
    const data = await this.leadsService.changeStatus(id, body.status, user);
    return { data };
  }

  @Post(':id/convert')
  @HttpCode(200)
  async convert(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    const data = await this.leadsService.convert(id, user);
    return { data };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async delete(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.leadsService.softDelete(id);
    return { data: { message: 'Đã xóa lead' } };
  }

  // Label attach/detach
  @Post(':id/labels')
  async attachLabels(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { labelIds: string[] },
  ) {
    await this.labelsService.attachToLead(id, body.labelIds.map(BigInt));
    return { data: { message: 'Đã gắn nhãn' } };
  }

  @Delete(':id/labels/:labelId')
  async detachLabel(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('labelId', ParseBigIntPipe) labelId: bigint,
  ) {
    await this.labelsService.detachFromLead(id, labelId);
    return { data: { message: 'Đã gỡ nhãn' } };
  }
}
