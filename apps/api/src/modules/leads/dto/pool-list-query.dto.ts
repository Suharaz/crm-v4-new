import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

// Status intentionally OMITTED - each pool endpoint has fixed status scope to prevent bypass.
export class PoolListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() sourceId?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() assignedUserId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() labelId?: string;
  @IsOptional() @IsString() hasOrder?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() search?: string;
}
