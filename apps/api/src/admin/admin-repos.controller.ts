import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import type { RepoSettingsRow } from 'shared';
import { AdminGuard } from '../common/guards/admin.guard';
import { UpdateRepoSettingsDto } from './dto/update-repo-settings.dto';
import { RepoSettingsService } from './repo-settings.service';

interface AuthedRequest extends Request {
  user: User;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

// GitHub owner / repo 命名允許字元
const NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

/**
 * AdminReposController
 * ---------------------------------------------------------------
 * GET   /api/admin/repos
 * PATCH /api/admin/repos/:owner/:name
 *
 * Path param 手動驗 regex（避免神祕字元走進 Prisma where clause）。
 */
@Controller('admin/repos')
@UseGuards(AdminGuard)
export class AdminReposController {
  constructor(private readonly repoSettings: RepoSettingsService) {}

  @Get()
  async list(): Promise<ApiSuccess<RepoSettingsRow[]>> {
    const data = await this.repoSettings.listAll();
    return { success: true, data };
  }

  @Patch(':owner/:name')
  async update(
    @Param('owner') owner: string,
    @Param('name') name: string,
    @Body() dto: UpdateRepoSettingsDto,
    @Req() req: AuthedRequest,
  ): Promise<ApiSuccess<RepoSettingsRow>> {
    this.assertValidName(owner, 'owner');
    this.assertValidName(name, 'name');
    const data = await this.repoSettings.updateOne(req.user.id, owner, name, dto);
    return { success: true, data };
  }

  private assertValidName(value: string, field: 'owner' | 'name'): void {
    if (!NAME_REGEX.test(value)) {
      throw new BadRequestException(
        `${field} 僅允許英數字、底線、點、連字號`,
      );
    }
  }
}
