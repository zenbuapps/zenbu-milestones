import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import type { SessionUserDTO, SubmittedIssueDTO } from 'shared';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { IssuesService } from '../issues/issues.service';

interface AuthedRequest extends Request {
  user: User;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

/**
 * MeController
 * ---------------------------------------------------------------
 * 以「當前登入者」視角提供查詢 API：
 *
 *   GET /api/me         → SessionUserDTO（當前使用者基本資料）
 *   GET /api/me/issues  → SubmittedIssueDTO[]（自己送過的 issue）
 *
 * 全域 AuthenticatedGuard 保護，未登入一律 401。
 */
@Controller('me')
@UseGuards(AuthenticatedGuard)
export class MeController {
  constructor(
    private readonly authService: AuthService,
    private readonly issuesService: IssuesService,
  ) {}

  @Get()
  me(@Req() req: AuthedRequest): ApiSuccess<SessionUserDTO> {
    return {
      success: true,
      data: this.authService.toSessionUser(req.user),
    };
  }

  @Get('issues')
  async myIssues(@Req() req: AuthedRequest): Promise<ApiSuccess<SubmittedIssueDTO[]>> {
    const data = await this.issuesService.listMine(req.user.id);
    return { success: true, data };
  }

  /**
   * 撤銷自己提的 pending issue（issue #6）。
   * Service 層會把 404 / 403 / 409 投擲為對應的 Nest 例外。
   */
  @Delete('issues/:id')
  @HttpCode(200)
  async withdrawIssue(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<ApiSuccess<{ id: string }>> {
    await this.issuesService.withdrawMine(id, req.user.id);
    return { success: true, data: { id } };
  }
}
