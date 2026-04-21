import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { UsersService } from '../users/users.service';

/**
 * GoogleStrategy
 * ---------------------------------------------------------------
 * 實作 Passport Google OAuth 2.0 驗證流程。
 *
 * 執行時機：
 *   1. GET /api/auth/google（由 AuthGuard('google') 觸發）→ 轉導 Google 同意畫面
 *   2. GET /api/auth/google/callback → Google 回呼 → 呼叫 validate()
 *
 * validate() 回傳的值會存到 req.user，並由 SessionSerializer 序列化到 cookie session。
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    private readonly usersService: UsersService,
    config: ConfigService,
  ) {
    const clientID = config.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = config.get<string>('GOOGLE_OAUTH_CLIENT_SECRET');
    const callbackURL = config.get<string>('GOOGLE_OAUTH_CALLBACK_URL');

    if (!clientID || !clientSecret || !callbackURL) {
      // 啟動期驗證：少填即直接 throw，讓 bootstrap 爆炸而非 runtime 才發現
      throw new InternalServerErrorException(
        'GOOGLE_OAUTH_* 環境變數不完整，請確認 .env 已填妥',
      );
    }

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  /**
   * Passport 會在 callback 階段呼叫此 method。
   * 回傳的 user 物件會被 PassportSerializer 序列化（只存 id 到 session）。
   */
  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        done(new Error('Google profile 未提供 email'), false);
        return;
      }

      const user = await this.usersService.upsertFromGoogle({
        googleSub: profile.id,
        email,
        displayName: profile.displayName || email,
        avatarUrl: profile.photos?.[0]?.value ?? null,
      });

      done(null, user);
    } catch (err) {
      this.logger.error('Google OAuth validate 失敗', err as Error);
      done(err as Error, false);
    }
  }
}
