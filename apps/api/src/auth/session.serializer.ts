import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import type { User } from '@prisma/client';
import { UsersService } from '../users/users.service';

type DoneFn<T> = (err: unknown, value?: T | false) => void;

/**
 * SessionSerializer
 * ---------------------------------------------------------------
 * 決定「login 成功後，哪些資料進到 cookie session」。
 *
 * - 只序列化 user.id → session cookie 體積最小
 * - 反序列化時用 id 重讀 DB，拿到最新的 role / displayName / avatarUrl
 *   （使用者資料更動時不需強制登出）
 *
 * 若使用者被刪除（findById 回 null），Passport 會把 session 視為無效，
 * 下一次請求 `req.isAuthenticated()` 就是 false。
 */
@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private readonly usersService: UsersService) {
    super();
  }

  serializeUser(user: User, done: DoneFn<string>): void {
    done(null, user.id);
  }

  async deserializeUser(id: string, done: DoneFn<User>): Promise<void> {
    try {
      const user = await this.usersService.findById(id);
      done(null, user ?? false);
    } catch (err) {
      done(err, false);
    }
  }
}
