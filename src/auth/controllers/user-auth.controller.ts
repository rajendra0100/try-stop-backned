import { Controller, Post, Body, HttpCode, HttpStatus, Patch, UseGuards, Get, Req, Param, Query, Delete } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { RegisterUserDto } from '../dto/register-user.dto';
import { SendOtpDto } from '../dto/send-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDocument } from '../schemas/user.schema';

/**
 * User Auth Controller
 *
 * POST /auth/register/user        — optional pre-registration
 * POST /auth/login/user           — send OTP (email or phone)
 * POST /auth/login/user/verify    — verify OTP → JWT tokens
 */
@Controller('auth')
export class UserAuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Optional pre-registration — captures name/contact before first OTP.
   * If skipped, auto-registration happens on /auth/login/user/verify.
   */
  @Post('register/user')
  async register(@Body() dto: RegisterUserDto) {
    return this.authService.registerUser(dto);
  }

  /** Step 1 — Request OTP to email or phone */
  @Throttle({ otp: { limit: 5, ttl: 60000 } })
  @Post('login/user')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  /** Step 2 — Verify OTP → returns JWT tokens (auto-registers if new) */
  @Throttle({ otp: { limit: 5, ttl: 60000 } })
  @Post('login/user/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtpAndLogin(dto, 'user');
  }

  /** Fetch profile details for authenticated user */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: any) {
    const userId = user.id || user._id?.toString() || user.sub;
    return this.authService.getProfile(userId);
  }

  /** Step 3 — Update profile details (optional, user-level) */
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser() user: any,
    @Body() dto: UpdateProfileDto,
  ) {
    const userId = user.id || user._id?.toString() || user.sub;
    return this.authService.updateProfile(userId, dto);
  }

  /** Step 4 — Logout */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: any) {
    const userId = user.id || user._id?.toString() || user.sub;
    return this.authService.logoutUser(userId);
  }

  /** Step 5 — Delete Account (Archives user record to deleted_users) */
  @Delete('delete-account')
  @UseGuards(JwtAuthGuard)
  async deleteAccount(@CurrentUser() user: any) {
    return this.authService.deleteAccount(user._id.toString());
  }



  /** GET /auth/addresses — get saved user addresses */
  @Get('addresses')
  @UseGuards(JwtAuthGuard)
  async getAddresses(@CurrentUser() user: any) {
    return this.authService.getUserAddresses(user._id.toString());
  }

  /** POST /auth/address — save new address */
  @Post('address')
  @UseGuards(JwtAuthGuard)
  async addAddress(@CurrentUser() user: any, @Body() dto: any) {
    return this.authService.addUserAddress(user._id.toString(), dto);
  }

  /** PATCH /auth/address/:addressId — update saved address */
  @Patch('address/:addressId')
  @UseGuards(JwtAuthGuard)
  async updateAddress(
    @CurrentUser() user: any,
    @Param('addressId') addressId: string,
    @Body() dto: any,
  ) {
    return this.authService.updateUserAddress(user._id.toString(), addressId, dto);
  }

  /** DELETE /auth/address/:addressId — delete saved address */
  @Delete('address/:addressId')
  @UseGuards(JwtAuthGuard)
  async deleteAddress(@CurrentUser() user: any, @Param('addressId') addressId: string) {
    return this.authService.deleteUserAddress(user._id.toString(), addressId);
  }

  /** POST /auth/track-location — record user location activity & last selected location */
  @Post('track-location')
  @UseGuards(JwtAuthGuard)
  async trackLocation(@CurrentUser() user: any, @Body() locationData: any) {
    return this.authService.trackUserLocation(user._id.toString(), locationData);
  }

  /** GET /auth/popular-localities — fetch dynamic popular localities nearest to user */
  @SkipThrottle()
  @Get('popular-localities')
  @HttpCode(HttpStatus.OK)
  async getPopularLocalities(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.authService.getPopularLocalities(
      lat ? parseFloat(lat) : undefined,
      lng ? parseFloat(lng) : undefined,
    );
  }

  /** GET /auth/reverse-geocode — converts lat/lng to a readable city/pincode */
  @SkipThrottle()
  @Get('reverse-geocode')
  @HttpCode(HttpStatus.OK)
  async reverseGeocode(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ) {
    return this.authService.reverseGeocode(parseFloat(lat), parseFloat(lng));
  }

  /** GET /auth/search-location — search places by query biased by lat/lng */
  @SkipThrottle()
  @Get('search-location')
  @HttpCode(HttpStatus.OK)
  async searchLocation(
    @Query('q') q: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.authService.searchLocation(
      q,
      lat ? parseFloat(lat) : undefined,
      lng ? parseFloat(lng) : undefined,
    );
  }

  /** GET /auth/favorites or /auth/following — fetch user's followed sellers */
  @Get('favorites')
  @UseGuards(JwtAuthGuard)
  async getFavorites(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.authService.getFavoriteSellers(user._id.toString(), page, limit);
  }

  @Get('following')
  @UseGuards(JwtAuthGuard)
  async getFollowing(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.authService.getFavoriteSellers(user._id.toString(), page, limit);
  }

  /** POST /auth/favorites/:sellerId or /auth/follow/:sellerId — toggle follow/favorite seller */
  @Post('favorites/:sellerId')
  @UseGuards(JwtAuthGuard)
  async toggleFavorite(
    @CurrentUser() user: any,
    @Param('sellerId') sellerId: string,
  ) {
    return this.authService.toggleFavoriteSeller(user._id.toString(), sellerId);
  }

  @Post('follow/:sellerId')
  @UseGuards(JwtAuthGuard)
  async toggleFollow(
    @CurrentUser() user: any,
    @Param('sellerId') sellerId: string,
  ) {
    return this.authService.toggleFavoriteSeller(user._id.toString(), sellerId);
  }
}
