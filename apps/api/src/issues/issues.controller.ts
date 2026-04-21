import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { SubmittedIssueDTO } from 'shared';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { CreateIssueDto } from './dto/create-issue.dto';
import { IssuesService } from './issues.service';

/**
 * Passport 在 session 反序列化後把 user 寫到 req.user。
 * 此型別只列出這層 controller 需要的最小欄位；完整的 User model 留在 DB。
 */
interface AuthedUser {
  id: string;
}

interface AuthedRequest extends Request {
  user: AuthedUser;
}

/**
 * 標準成功回應包裝。之後所有 API 都會走這個形狀，
 * 方便前端統一處理成功 / 失敗分支（失敗走 Nest 預設的 { statusCode, message, error }）。
 */
interface ApiSuccess<T> {
  success: true;
  data: T;
}

/**
 * IssuesController
 * ---------------------------------------------------------------
 * POST /api/issues — 需登入。建立一筆 status=pending 的 issue 草稿。
 *
 * 回傳 201 + { success: true, data: SubmittedIssueDTO }。
 * 為何非 200：POST 建立資源的慣例是 201 Created。
 */
@Controller('issues')
@UseGuards(AuthenticatedGuard)
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: AuthedRequest,
    @Body() dto: CreateIssueDto,
  ): Promise<ApiSuccess<SubmittedIssueDTO>> {
    const data = await this.issuesService.createDraft(req.user.id, dto);
    return { success: true, data };
  }
}
