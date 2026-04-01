import { IsOptional, IsString, IsEnum } from 'class-validator';
import { LeadStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class LeadListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  labelId?: string;

  @IsOptional()
  @IsString()
  hasOrder?: string; // 'true' or 'false'

  @IsOptional()
  @IsString()
  dateFrom?: string; // ISO date

  @IsOptional()
  @IsString()
  dateTo?: string; // ISO date

  @IsOptional()
  @IsString()
  search?: string;
}
