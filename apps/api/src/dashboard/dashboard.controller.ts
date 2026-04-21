import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  MilestoneIssuesPage,
  RepoDetail,
  Summary,
} from 'shared';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { DashboardService } from './dashboard.service';
import { MilestoneIssuesQueryDto } from './dto/milestone-issues-query.dto';

interface ApiSuccess<T> {
  success: true;
  data: T;
}

/**
 * 分頁預設值；與 /api/admin/issues 的 REST 風格保持一致（未傳 → 取合理預設）。
 */
const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 50;

/**
 * DashboardController
 * ---------------------------------------------------------------
 * Phase 2 runtime API 共三個 GET：
 *   GET /api/summary
 *   GET /api/repos/:owner/:name/detail
 *   GET /api/repos/:owner/:name/milestones/:number/issues?page=&perPage=
 *
 * 全部套 AuthenticatedGuard（未登入 → 401，與 IssuesController 相同）。
 * 回傳統一包 `{ success: true, data }` envelope（與 IssuesController / AdminIssuesController 對齊）。
 *
 * 刻意不掛在 /api/repos 下面，因為 ReposController 是「公開」的（用於 AppShell 初始化），
 * 而這些 endpoint 需登入；route prefix 分開更清楚。
 * 實際路徑由 AppModule 的 global prefix `/api` 與各 `@Controller(...)` 拼接：
 *   @Controller('summary')                       → /api/summary
 *   @Controller('repos/:owner/:name/detail') ... → /api/repos/...
 */
@Controller()
@UseGuards(AuthenticatedGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  async getSummary(): Promise<ApiSuccess<Summary>> {
    const data = await this.dashboard.getSummary();
    return { success: true, data };
  }

  @Get('repos/:owner/:name/detail')
  async getRepoDetail(
    @Param('owner') owner: string,
    @Param('name') name: string,
  ): Promise<ApiSuccess<RepoDetail>> {
    const data = await this.dashboard.getRepoDetail(owner, name);
    return { success: true, data };
  }

  @Get('repos/:owner/:name/milestones/:number/issues')
  async getMilestoneIssues(
    @Param('owner') owner: string,
    @Param('name') name: string,
    @Param('number', new ParseIntPipe()) milestoneNumber: number,
    @Query() query: MilestoneIssuesQueryDto,
  ): Promise<ApiSuccess<MilestoneIssuesPage>> {
    const page = query.page ?? DEFAULT_PAGE;
    const perPage = query.perPage ?? DEFAULT_PER_PAGE;
    const data = await this.dashboard.getMilestoneIssues(
      owner,
      name,
      milestoneNumber,
      page,
      perPage,
    );
    return { success: true, data };
  }
}
