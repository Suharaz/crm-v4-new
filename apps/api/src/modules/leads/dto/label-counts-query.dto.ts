import { IsOptional, IsIn } from 'class-validator';
import { PoolListQueryDto } from './pool-list-query.dto';

/**
 * Query DTO for GET /leads/label-counts.
 * Extends PoolListQueryDto so the same filter set (sourceId, dateFrom, etc.)
 * applies. Adds scope to pick which page family the counts are for.
 */
export class LabelCountsQueryDto extends PoolListQueryDto {
  @IsOptional()
  @IsIn(['my', 'pool-new', 'pool-zoom', 'floating'])
  scope?: 'my' | 'pool-new' | 'pool-zoom' | 'floating';
}
