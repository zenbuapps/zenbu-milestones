import { IsIn } from 'class-validator';
import type { UpdateUserRoleInput, UserRole } from 'shared';

/**
 * UpdateUserRoleDto
 * ---------------------------------------------------------------
 * PATCH /api/admin/users/:id/role 的請求 body。
 *
 * role 只能是 'user' | 'admin'；其他值會被 400 拒絕（class-validator）。
 * 業務規則（自改自己 / 最後一位 admin）由 Service 層檢查，此處純欄位驗證。
 */
export class UpdateUserRoleDto implements UpdateUserRoleInput {
  @IsIn(['user', 'admin'] as const)
  role!: UserRole;
}
