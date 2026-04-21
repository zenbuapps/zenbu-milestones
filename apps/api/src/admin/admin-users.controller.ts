import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import type { AdminUserRow } from 'shared';
import { AdminGuard } from '../common/guards/admin.guard';
import { UsersService } from '../users/users.service';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

interface AuthedRequest extends Request {
  user: User;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

/**
 * AdminUsersController
 * ---------------------------------------------------------------
 * GET   /api/admin/users
 * PATCH /api/admin/users/:id/role
 *
 * Service 層負責：
 *   - 自改自己檢查 → 403
 *   - 最後一位 admin 防護 → 403
 *   - 寫 audit log（role.grant / role.revoke）
 */
@Controller('admin/users')
@UseGuards(AdminGuard)
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(): Promise<ApiSuccess<AdminUserRow[]>> {
    const data = await this.users.listAll();
    return { success: true, data };
  }

  @Patch(':id/role')
  async updateRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserRoleDto,
    @Req() req: AuthedRequest,
  ): Promise<ApiSuccess<AdminUserRow>> {
    const data = await this.users.updateRole(req.user.id, id, dto.role);
    return { success: true, data };
  }
}
