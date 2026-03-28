import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ProductsService } from './products.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  async list(@Query() query: PaginationQueryDto, @Query('search') search?: string) {
    return this.service.list({ ...query, search });
  }

  @Get(':id')
  async findById(@Param('id', ParseBigIntPipe) id: bigint) {
    return { data: await this.service.findById(id) };
  }

  @Post()
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async create(@Body() body: { name: string; price: number; description?: string; categoryId?: string; vatRate?: number }) {
    return { data: await this.service.create(body) };
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async update(@Param('id', ParseBigIntPipe) id: bigint, @Body() body: Record<string, unknown>) {
    return { data: await this.service.update(id, body as any) };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async delete(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.softDelete(id);
    return { data: { message: 'Đã xóa sản phẩm' } };
  }
}
