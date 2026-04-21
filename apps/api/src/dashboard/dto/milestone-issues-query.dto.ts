import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * GET /api/repos/:owner/:name/milestones/:number/issues?page=&perPage=
 *
 * query string 全部為字串，走 @Type(() => Number) 配合 ValidationPipe({ transform: true })
 * 轉型後再由 class-validator 驗證範圍。
 */
export class MilestoneIssuesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  perPage?: number;
}
