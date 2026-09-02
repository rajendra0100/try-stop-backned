import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from '../auth.service';

/**
 * Shared Auth Controller — token management.
 * Applies to all roles (user, rider, seller, admin, subadmin).
 *
 * POST /auth/refresh    — refresh access token using refresh token
 */
@Controller('auth')
export class SharedAuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Refreshes the access token.
   * Does NOT use JwtAuthGuard because we verify the refresh token manually
   * inside the service using the separate JWT_REFRESH_SECRET.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }
}
