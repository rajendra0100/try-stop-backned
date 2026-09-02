import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('referral')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  /**
   * Links the logged-in user to the referrer user.
   * Called by referee app during login or launch when referred.
   */
  @UseGuards(JwtAuthGuard)
  @Post('register-claim')
  async claimReferral(@Request() req: any, @Body('referrerId') referrerId: string) {
    const refereeId = req.user.id;
    const referral = await this.referralService.linkReferral(refereeId, referrerId);
    return {
      success: true,
      message: 'Referral linked successfully',
      data: referral,
    };
  }

  @Get('config')
  async getConfig() {
    const config = await this.referralService.getActiveConfig();
    return {
      success: true,
      data: config,
    };
  }

  /**
   * User: Retrieves own referral stats and invited referee details.
   */
  @UseGuards(JwtAuthGuard)
  @Get('my-referrals')
  async getMyReferrals(@Request() req: any) {
    const userId = req.user.id;
    const referrals = await this.referralService.getUserReferrals(userId);
    const totalReferred = referrals.length;
    const completedReferred = referrals.filter((r) => r.status === 'completed').length;
    const totalCashbackEarned = referrals.reduce((sum, r) => sum + (r.rewardAmount || 0), 0);

    return {
      success: true,
      data: {
        referrals,
        totalReferred,
        completedReferred,
        totalCashbackEarned,
      },
    };
  }

  /**
   * Admin: Saves referral rewards configuration.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN)
  @Post('admin/config')
  async saveConfig(
    @Body() dto: { rewardType?: 'fixed' | 'percentage'; rewardValue?: number; bannerImageUrl?: string; appVersion?: string },
  ) {
    const config = await this.referralService.saveConfig(dto);
    return {
      success: true,
      message: 'Referral configuration saved successfully',
      data: config,
    };
  }

  /**
   * Admin: Retrieves global referral metrics of all sharing referrers.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN)
  @Get('admin/stats')
  async getAdminStats() {
    const stats = await this.referralService.getAdminStats();
    return {
      success: true,
      data: stats,
    };
  }

  /**
   * Admin: Retrieves details of referees referred by a single user.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN)
  @Get('admin/user-referrals/:userId')
  async getUserReferrals(@Param('userId') userId: string) {
    const invites = await this.referralService.getUserReferrals(userId);
    return {
      success: true,
      data: invites,
    };
  }
}
