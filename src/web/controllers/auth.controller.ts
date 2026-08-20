import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { LoginResponse, MeResponse } from '../../contracts';
import { InvalidTokenError } from '../../business/domain/errors/errors';
import { ForgotPasswordHandler } from '../../business/handlers/identity/forgot-password.handler';
import { LoginHandler } from '../../business/handlers/identity/login.handler';
import { RegisterHandler } from '../../business/handlers/identity/register.handler';
import { ResetPasswordHandler } from '../../business/handlers/identity/reset-password.handler';
import {
  SessionService,
  type IssuedSession,
} from '../../business/handlers/identity/session.service';
import { VerifyEmailHandler } from '../../business/handlers/identity/verify-email.handler';
import { MeQuery } from '../../query/me.query';
import { CurrentUser } from '../security/current-user.decorator';
import { Public } from '../security/public.decorator';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from '../validation/auth.dto';

const REFRESH_COOKIE = 'easyread_rt';

/**
 * Scoped to the auth routes so the refresh token isn't attached to every API
 * call. It must include the global prefix — a bare '/auth' would never match
 * the mounted path and the cookie would silently never be sent.
 */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** cookie-parser types its bag as `any`; read it with a real shape. */
const cookieToken = (request: Request): string | undefined =>
  (request.cookies as Record<string, string | undefined> | undefined)?.[
    REFRESH_COOKIE
  ];

/**
 * Access tokens are returned in the body for the client to hold in memory;
 * the refresh token only ever lives in an httpOnly cookie, so XSS on the web
 * app can't walk away with a long-lived credential (§3.1).
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly register: RegisterHandler,
    private readonly login: LoginHandler,
    private readonly verifyEmail: VerifyEmailHandler,
    private readonly forgotPassword: ForgotPasswordHandler,
    private readonly resetPassword: ResetPasswordHandler,
    private readonly sessions: SessionService,
    private readonly me: MeQuery,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(201)
  async registerUser(@Body() body: RegisterDto): Promise<{ ok: true }> {
    await this.register.handle(body);
    return { ok: true };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async loginUser(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.login.handle({
      ...body,
      userAgent: request.get('user-agent') ?? null,
      ip: request.ip ?? null,
    });
    return this.completeSession(result.data, response);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() body: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    // The body token is the client's own copy and always its newest; the
    // cookie backs it up on browsers that kept one.
    const presented = body?.refreshToken ?? cookieToken(request);
    if (!presented) throw new InvalidTokenError('You are not signed in');

    const session = await this.sessions.rotate(presented, {
      userAgent: request.get('user-agent') ?? null,
      ip: request.ip ?? null,
    });
    return this.completeSession(session, response);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() body: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const presented = body?.refreshToken ?? cookieToken(request);
    if (presented) await this.sessions.revoke(presented);
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions(0));
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  async verify(@Body() body: VerifyEmailDto): Promise<{ ok: true }> {
    await this.verifyEmail.handle(body);
    return { ok: true };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  async forgot(@Body() body: ForgotPasswordDto): Promise<{ ok: true }> {
    await this.forgotPassword.handle(body);
    return { ok: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async reset(@Body() body: ResetPasswordDto): Promise<{ ok: true }> {
    await this.resetPassword.handle(body);
    return { ok: true };
  }

  @Get('me')
  async currentUser(@CurrentUser('id') userId: string): Promise<MeResponse> {
    return this.me.execute(userId);
  }

  private completeSession(
    session: IssuedSession,
    response: Response,
  ): LoginResponse {
    response.cookie(
      REFRESH_COOKIE,
      session.refreshToken,
      this.cookieOptions(session.refreshExpiresAt.getTime() - Date.now()),
    );
    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      refreshToken: session.refreshToken,
    };
  }

  private cookieOptions(maxAge: number): CookieOptions {
    const secure = this.config.get('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure,
      // `lax` still sends the cookie on the top-level navigation back from a
      // verification link, which `strict` would drop.
      sameSite: secure ? 'none' : 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge,
    };
  }
}
