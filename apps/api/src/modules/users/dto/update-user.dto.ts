import { IsString, IsOptional, IsEnum, MinLength, MaxLength } from 'class-validator';
import { UserRole, UserStatus } from '@prisma/client';

/** Self-update DTO: limited fields only. */
export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;
}

/** Admin update DTO: all fields including role, department, status. */
export class AdminUpdateUserDto extends UpdateUserProfileDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  employeeLevelId?: string;

  @IsOptional()
  isLeader?: boolean;
}
