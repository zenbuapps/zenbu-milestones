import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { SessionUserDTO } from 'shared';

/**
 * AuthService
 * ---------------------------------------------------------------
 * 目前只放把 DB User 投影到對前端安全的 SessionUserDTO 的邏輯。
 * 之後若加入 MFA / token refresh / permission 計算，也放這裡。
 *
 * 投影目的：把 googleSub、timestamps 等敏感/內部欄位擋掉，只暴露 UI 需要的資訊。
 */
@Injectable()
export class AuthService {
  toSessionUser(user: User): SessionUserDTO {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
    };
  }
}
