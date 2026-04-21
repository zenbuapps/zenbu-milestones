import { Module } from '@nestjs/common';
import { AuditService } from '../admin/audit.service';
import { UsersService } from './users.service';

/**
 * UsersModule
 * ---------------------------------------------------------------
 * 匯出 UsersService 給 AuthModule（GoogleStrategy / SessionSerializer）與
 * AdminUsersController 使用。
 *
 * providers 中本地 new 一份 AuditService：
 *   - UsersService.updateRole 需要寫 role.grant / role.revoke 稽核
 *   - 不 import AdminModule 以避免循環依賴（AdminModule imports UsersModule）
 */
@Module({
  providers: [UsersService, AuditService],
  exports: [UsersService],
})
export class UsersModule {}
