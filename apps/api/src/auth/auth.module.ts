import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './google.strategy';
import { SessionSerializer } from './session.serializer';

/**
 * AuthModule
 * ---------------------------------------------------------------
 * - PassportModule.register({ session: true })：啟用 session-based 認證
 *   （相對於 JWT；配合 main.ts 的 express-session + passport.session()）
 * - 匯出 AuthService：MeController 需要它來投影 req.user → SessionUserDTO
 */
@Module({
  imports: [UsersModule, PassportModule.register({ session: true })],
  controllers: [AuthController],
  providers: [AuthService, GoogleStrategy, SessionSerializer],
  exports: [AuthService],
})
export class AuthModule {}
