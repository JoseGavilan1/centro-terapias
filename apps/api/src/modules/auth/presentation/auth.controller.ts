import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthUserDto, LoginResponse, RefreshResponse } from '@centro/shared';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ReqContext } from '../../../common/decorators/request-context.decorator';
import { REFRESH_TOKEN_COOKIE } from '../../../common/constants/auth-cookies';
import { AuthenticatedUser, RequestContext, RequestWithUser } from '../../../common/types/authenticated-user';
import { AuthService } from '../application/auth.service';
import { AuthCookieHelper } from './cookie.helper';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión' })
  async login(
    @Body() dto: LoginDto,
    @ReqContext() context: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const result = await this.authService.login(dto, context);
    new AuthCookieHelper(res, this.configService).setSessionCookies(
      result.accessToken,
      result.refreshToken,
      result.expiresIn,
    );
    return { user: result.user, accessToken: result.accessToken, expiresIn: result.expiresIn };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar el access token usando el refresh token' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @ReqContext() context: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponse> {
    const cookies = req.cookies as Record<string, string> | undefined;
    const rawToken = cookies?.[REFRESH_TOKEN_COOKIE] ?? dto.refreshToken;
    const cookieHelper = new AuthCookieHelper(res, this.configService);

    if (!rawToken) {
      cookieHelper.clearSessionCookies();
      throw new UnauthorizedException('Sesión inválida');
    }

    try {
      const result = await this.authService.refresh(rawToken, context);
      cookieHelper.setSessionCookies(result.accessToken, result.refreshToken, result.expiresIn);
      return { accessToken: result.accessToken, expiresIn: result.expiresIn };
    } catch (error) {
      // Un refresh inválido/expirado/reusado nunca deja una cookie muerta que
      // el cliente reintente en loop: se limpia igual que si no hubiera token.
      cookieHelper.clearSessionCookies();
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar la sesión actual' })
  async logout(
    @Req() req: RequestWithUser,
    @ReqContext() context: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const cookies = req.cookies as Record<string, string> | undefined;
    const rawToken = cookies?.[REFRESH_TOKEN_COOKIE];
    await this.authService.logout(rawToken, req.user?.userId ?? null, context);
    new AuthCookieHelper(res, this.configService).clearSessionCookies();
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener el usuario autenticado' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthUserDto> {
    return this.authService.me(user.organizationId, user.userId);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambiar la contraseña propia (revoca otras sesiones)' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @ReqContext() context: RequestContext,
  ): Promise<void> {
    const cookies = req.cookies as Record<string, string> | undefined;
    await this.authService.changePassword(
      user.userId,
      user.organizationId,
      dto,
      context,
      cookies?.[REFRESH_TOKEN_COOKIE] ?? dto.refreshToken,
    );
  }
}
