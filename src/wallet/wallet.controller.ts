import {
  Controller, Post, Get, Body, Query, UseGuards,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletCreditDto } from './dto/wallet-credit.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';

/**
 * WalletController — wallet balance and transaction history endpoints.
 *
 * Route access summary:
 *   GET  /wallet/balance   — auth (USER) — get current balance
 *   GET  /wallet/history   — auth (USER) — paginated transaction history
 *   POST /wallet/credit    — admin — credit a single user or all users
 */
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    @InjectQueue('wallet-operations') private readonly walletQueue: Queue,
  ) {}

  /**
   * GET /wallet/balance
   * Returns the customer's current wallet balance.
   * AUTH required — customer (USER) only.
   */
  @Get('balance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  async getBalance(@CurrentUser() user: any) {
    return this.walletService.getBalance(user._id.toString());
  }

  /**
   * GET /wallet/history
   * Returns the customer's wallet transaction history (paginated).
   * AUTH required — customer (USER) only.
   */
  @Get('history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  async getHistory(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.walletService.getHistory(user._id.toString(), page, limit);
  }

  /**
   * GET /wallet/admin/metrics
   * Returns total outstanding wallet balance and system liability metrics.
   * AUTH required — admin only.
   */
  @Get('admin/metrics')
  @RequirePermission('manage_wallet')
  async getAdminMetrics() {
    return this.walletService.getSystemWalletMetrics();
  }

  /**
   * POST /wallet/credit
   * Admin-only: credit wallet for a single user or broadcast to all users.
   * For "all" target, runs as a background job to avoid HTTP timeout.
   * AUTH required — admin only (superadmin or subadmin with manage_wallet).
   */
  @Post('credit')
  @RequirePermission('manage_wallet')
  async creditWallet(@Body() dto: WalletCreditDto) {
    if (dto.target === 'user') {
      if (!dto.userId) {
        return { error: 'userId is required when target is "user"' };
      }
      const result = await this.walletService.adminCredit(
        dto.userId,
        dto.amount,
        'admin_credit',
        dto.reason,
      );
      return { message: `₹${dto.amount} credited to user ${dto.userId}`, transaction: result };
    }

    // Broadcast credit — dispatch as background job
    await this.walletQueue.add('broadcast-credit', {
      amount: dto.amount,
      reason: dto.reason || 'promo_credit',
    });

    return {
      message: `Broadcast credit of ₹${dto.amount} dispatched as background job. This may take a few minutes.`,
    };
  }
}
