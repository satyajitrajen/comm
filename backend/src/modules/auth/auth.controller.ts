import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LogoutDto, RefreshTokenDto } from './dto/refresh-token.dto';
import { Verify2FaDto } from './dto/verify-2fa.dto';

@Controller('api/v1/auth')
@Throttle({ default: { limit: 40, ttl: 60_000 } })
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() body: RegisterDto) {
    return await this.authService.register(body);
  }

  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post('login')
  async login(@Body() body: LoginDto, @Req() req: Request) {
    return await this.authService.login({
      ...body,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'Unknown',
    });
  }

  @Post('refresh')
  async refresh(@Body() body: RefreshTokenDto) {
    return await this.authService.refreshTokens(
      body.sessionId,
      body.refreshToken,
    );
  }

  /**
   * Deliberately always 200 with the same body, whether or not the address is
   * registered, so this cannot be used to discover accounts. Throttled hard
   * because it sends mail.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() body: { email?: string }, @Req() req: Request) {
    const origin = (req.headers.origin as string) || undefined;
    await this.authService.requestPasswordReset(body?.email ?? '', origin);
    return {
      ok: true,
      message: 'If that address has an account, a reset link is on its way.',
    };
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('reset-password')
  async resetPassword(@Body() body: { token?: string; password?: string }) {
    return await this.authService.resetPassword(
      body?.token ?? '',
      body?.password ?? '',
    );
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-2fa')
  async verifyOtp(@Body() body: Verify2FaDto, @Req() req: Request) {
    const ipAddress = req.ip || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    return await this.authService.verifyOtp({
      verifyKey: body.verifyKey,
      otpCode: body.otpCode,
      ipAddress,
      userAgent,
    });
  }

  @Post('logout')
  async logout(@Body() body: LogoutDto) {
    return await this.authService.logout(body.sessionId, body.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUserId() userId: string) {
    return await this.authService.getCurrentUser(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('change-password')
  async changePassword(
    @CurrentUserId() userId: string,
    @Body() body: ChangePasswordDto,
  ) {
    return await this.authService.changePassword(
      userId,
      body.currentPassword,
      body.newPassword,
    );
  }
}
