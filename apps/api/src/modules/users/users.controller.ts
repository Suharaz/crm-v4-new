import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AdminUpdateUserDto, UpdateUserProfileDto } from './dto/update-user.dto';
import { UserListQueryDto } from './dto/user-list-query.dto';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async list(@Query() query: UserListQueryDto) {
    return this.usersService.list(query);
  }

  @Get(':id')
  async findById(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() currentUser: { id: bigint; role: UserRole },
  ) {
    // Users can only view themselves unless they're manager+
    if (currentUser.role === UserRole.USER && currentUser.id !== id) {
      const user = await this.usersService.findById(currentUser.id);
      return { data: user };
    }
    const user = await this.usersService.findById(id);
    return { data: user };
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  async create(@Body() dto: CreateUserDto) {
    const user = await this.usersService.create(dto);
    return { data: user };
  }

  @Patch('profile')
  async updateProfile(
    @Body() dto: UpdateUserProfileDto,
    @CurrentUser() currentUser: { id: bigint },
  ) {
    const user = await this.usersService.updateProfile(currentUser.id, dto);
    return { data: user };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async adminUpdate(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: AdminUpdateUserDto,
  ) {
    const user = await this.usersService.adminUpdate(id, dto);
    return { data: user };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async deactivate(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() currentUser: { id: bigint },
  ) {
    return this.usersService.deactivate(id, currentUser.id);
  }
}
