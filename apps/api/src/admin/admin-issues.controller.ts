import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import type { AdminIssueRow, IssueStatus } from 'shared';
import { AdminGuard } from '../common/guards/admin.guard';
import { IssuesService } from '../issues/issues.service';
import { RejectIssueDto } from './dto/reject-issue.dto';

interface AuthedRequest extends Request {
  user: User;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiFailure {
  success: false;
  error: { code: string; message: string };
  data?: AdminIssueRow; // approve GitHub 失敗時保留最新 row 給前端顯示
}

type AdminIssueStatusFilter = IssueStatus | 'all';
const VALID_STATUSES: AdminIssueStatusFilter[] = [
  'pending',
  'approved',
  'rejected',
  'synced-to-github',
  'all',
];

/**
 * AdminIssuesController
 * ---------------------------------------------------------------
 * Issue 審核三個 endpoint：
 *   GET  /api/admin/issues?status=pending|approved|rejected|synced-to-github|all
 *   POST /api/admin/issues/:id/approve
 *   POST /api/admin/issues/:id/reject
 *
 * 所有路由掛 AdminGuard（未登入 401；非 admin 403）。
 *
 * approve 的 envelope 約定（plan §9 GitHub 失敗行）：
 *   - 全程成功 → 201 { success: true, data: AdminIssueRow }
 *   - GitHub 失敗但 DB 已推進到 approved → 200
 *       { success: false, error: { code, message }, data: AdminIssueRow }
 *     回 200 讓前端一次拿到「狀態已變」+「GitHub 出事」兩件事，UI 提示重試。
 */
@Controller('admin/issues')
@UseGuards(AdminGuard)
export class AdminIssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Get()
  async list(
    @Query('status') statusRaw?: string,
  ): Promise<ApiSuccess<AdminIssueRow[]>> {
    const status = this.normalizeStatus(statusRaw);
    const rows = await this.issues.listAll(status);
    return { success: true, data: rows };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthedRequest,
  ): Promise<ApiSuccess<AdminIssueRow> | ApiFailure> {
    const result = await this.issues.approveAndSync(id, req.user.id);
    if (result.syncedToGitHub) {
      return { success: true, data: result.row };
    }
    // GitHub 失敗：envelope 為 failure，但帶回 data 方便前端更新列表
    const err = result.githubError ?? {
      code: 'UPSTREAM_ERROR',
      message: 'GitHub 呼叫失敗',
    };
    return {
      success: false,
      error: { code: err.code, message: err.message },
      data: result.row,
    };
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectIssueDto,
    @Req() req: AuthedRequest,
  ): Promise<ApiSuccess<AdminIssueRow>> {
    const row = await this.issues.reject(id, req.user.id, dto.reason);
    return { success: true, data: row };
  }

  /** 把 query string 規範化為 IssueStatus | 'all' | undefined。預設 pending。 */
  private normalizeStatus(raw: string | undefined): AdminIssueStatusFilter {
    if (!raw || raw === '') return 'pending';
    const casted = raw as AdminIssueStatusFilter;
    if (!VALID_STATUSES.includes(casted)) {
      throw new BadRequestException(
        `status 參數僅允許：${VALID_STATUSES.join(' | ')}`,
      );
    }
    return casted;
  }
}
