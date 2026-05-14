import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import type { PinnedRepoDTO, SessionUserDTO, SubmittedIssueDTO } from 'shared';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { IssuesService } from '../issues/issues.service';
import { PinnedReposService } from './pinned-repos.service';

interface AuthedRequest extends Request {
  user: User;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

/**
 * POST /api/me/pinned-repos 的 body。
 * 與 GitHub 的命名規則一致：name segment 允許英數 / - / _ / . ；長度上限 100
 * 以避免明顯亂打。
 */
class PinRepoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9._-]+$/)
  repoOwner!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9._-]+$/)
  repoName!: string;
}

/**
 * MeController
 * ---------------------------------------------------------------
 * 以「當前登入者」視角提供查詢 / 偏好 API：
 *
 *   GET    /api/me                          → SessionUserDTO（當前使用者基本資料）
 *   GET    /api/me/issues                   → SubmittedIssueDTO[]（自己送過的 issue）
 *   DELETE /api/me/issues/:id               → 撤銷自己提的 pending issue
 *   GET    /api/me/pinned-repos             → PinnedRepoDTO[]（個人釘選清單；issue #16）
 *   POST   /api/me/pinned-repos             → 釘選一個 repo（409 已釘選）
 *   DELETE /api/me/pinned-repos/:owner/:name → 取消釘選（404 未釘選）
 *
 * 全域 AuthenticatedGuard 保護，未登入一律 401。
 */
@Controller('me')
@UseGuards(AuthenticatedGuard)
export class MeController {
  constructor(
    private readonly authService: AuthService,
    private readonly issuesService: IssuesService,
    private readonly pinnedRepos: PinnedReposService,
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

  // -------------------------------------------------------------------------
  // 個人化釘選清單（issue #16）
  // -------------------------------------------------------------------------

  @Get('pinned-repos')
  async listPinned(@Req() req: AuthedRequest): Promise<ApiSuccess<PinnedRepoDTO[]>> {
    const data = await this.pinnedRepos.list(req.user.id);
    return { success: true, data };
  }

  @Post('pinned-repos')
  @HttpCode(HttpStatus.CREATED)
  async pin(
    @Req() req: AuthedRequest,
    @Body() dto: PinRepoDto,
  ): Promise<ApiSuccess<PinnedRepoDTO>> {
    const data = await this.pinnedRepos.pin(req.user.id, dto.repoOwner, dto.repoName);
    return { success: true, data };
  }

  @Delete('pinned-repos/:owner/:name')
  @HttpCode(HttpStatus.OK)
  async unpin(
    @Req() req: AuthedRequest,
    @Param('owner') owner: string,
    @Param('name') name: string,
  ): Promise<ApiSuccess<{ repoOwner: string; repoName: string }>> {
    await this.pinnedRepos.unpin(req.user.id, owner, name);
    return { success: true, data: { repoOwner: owner, repoName: name } };
  }
}
