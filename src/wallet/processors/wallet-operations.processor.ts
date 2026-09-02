import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { WalletService } from '../wallet.service';

/**
 * WalletOperationsProcessor — handles background wallet jobs.
 *
 * Currently handles broadcast wallet credits (when admin credits all users).
 * Runs asynchronously to avoid HTTP timeout for large user bases.
 */
@Processor('wallet-operations')
export class WalletOperationsProcessor {
  private readonly logger = new Logger(WalletOperationsProcessor.name);

  constructor(private readonly walletService: WalletService) {}

  @Process('broadcast-credit')
  async handleBroadcastCredit(job: Job<{ amount: number; reason: string }>): Promise<void> {
    const { amount, reason } = job.data;
    this.logger.log(`[Job ${job.id}] Starting broadcast credit: ₹${amount} (${reason})`);

    const result = await this.walletService.broadcastCredit(
      amount,
      reason as 'admin_credit' | 'promo_credit',
    );

    this.logger.log(
      `[Job ${job.id}] Broadcast credit complete: ${result.credited} credited, ${result.failed} failed`,
    );
  }
}
