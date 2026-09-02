import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

import { WalletService } from '../../wallet/wallet.service';
import { FcmNotificationService } from '../../fcm-notification/fcm-notification.service';
import { OfferService } from '../../offer/offer.service';
import { VoucherService } from '../../voucher/voucher.service';

/**
 * PaymentEventsProcessor — consumes payment side-effect jobs from BullMQ.
 *
 * Each side-effect is dispatched as an independent, retryable job:
 *   - wallet-operations: Debit wallet + credit cashback
 *   - send-notifications: Push alerts to customer and seller
 *   - update-ranking-signal: (handled by ranking cron, signal only)
 *   - record-coupon-usage: Track coupon redemption
 *
 * Failures in one job never block or roll back others (§10).
 * Each job has 3 retries with exponential backoff.
 */
@Processor('payment-events')
export class PaymentEventsProcessor {
  private readonly logger = new Logger(PaymentEventsProcessor.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly fcmNotificationService: FcmNotificationService,
    private readonly offerService: OfferService,
    private readonly voucherService: VoucherService,
  ) {}

  /**
   * Handles wallet operations after successful payment:
   *   1. Debit the wallet amount used (if any)
   *   2. Credit cashback (based on amountPaidOnline only — §3.2)
   */
  @Process('wallet-operations')
  async handleWalletOperations(job: Job): Promise<void> {
    const { transactionId, customerId, walletAmountUsed, voucherAmountUsed, cashbackEarned } = job.data;

    this.logger.log(`[Job ${job.id}] Processing wallet operations for txn ${transactionId}`);

    try {
      // 1. Debit wallet (if wallet was used)
      if (walletAmountUsed > 0) {
        await this.walletService.debitForPayment(customerId, walletAmountUsed, transactionId);
        this.logger.log(`[Job ${job.id}] Wallet debited: ₹${walletAmountUsed}`);
      }

      // 2. Debit voucher balance (if voucher was used)
      if (voucherAmountUsed > 0) {
        await this.voucherService.debitVoucherBalance(customerId, voucherAmountUsed, transactionId);
        this.logger.log(`[Job ${job.id}] Voucher balance debited: ₹${voucherAmountUsed}`);
      }

      // 3. Credit cashback (based on online portion only)
      if (cashbackEarned > 0) {
        await this.walletService.creditCashback(customerId, cashbackEarned, transactionId);
        this.logger.log(`[Job ${job.id}] Cashback credited: ₹${cashbackEarned}`);
      }
    } catch (error) {
      this.logger.error(`[Job ${job.id}] Wallet operations failed: ${error?.message}`);
      throw error; // BullMQ will retry
    }
  }

  /**
   * Sends push notifications to customer and seller after successful payment.
   */
  @Process('send-notifications')
  async handleSendNotifications(job: Job): Promise<void> {
    const { customerId, sellerId, totalAmount, cashbackEarned, amountPaidOnline, walletAmountUsed } = job.data;

    this.logger.log(`[Job ${job.id}] Sending payment notifications`);

    try {
      await this.fcmNotificationService.sendPaymentSuccessNotifications({
        customerId,
        sellerId,
        totalAmount,
        cashbackEarned,
        amountPaidOnline,
        walletAmountUsed,
      });
    } catch (error) {
      this.logger.error(`[Job ${job.id}] Notification sending failed: ${error?.message}`);
      throw error; // BullMQ will retry
    }
  }

  /**
   * Records ranking signal update for a seller.
   * The actual ranking recomputation happens via the scheduled cron job (§7.2),
   * not here — this just ensures the transaction data is committed for the cron to read.
   */
  @Process('update-ranking-signal')
  async handleUpdateRankingSignal(job: Job): Promise<void> {
    const { sellerId } = job.data;
    this.logger.log(`[Job ${job.id}] Ranking signal recorded for seller ${sellerId}`);
    // The ranking cron reads directly from the Transaction collection,
    // so no additional write is needed here. This job exists for future
    // extensibility (e.g., real-time ranking cache invalidation).
  }

  /**
   * Records coupon usage after successful payment.
   */
  @Process('record-coupon-usage')
  async handleRecordCouponUsage(job: Job): Promise<void> {
    const { couponCode, customerId } = job.data;

    this.logger.log(`[Job ${job.id}] Recording coupon usage: ${couponCode} for ${customerId}`);

    try {
      await this.offerService.recordCouponUsage(couponCode, customerId);
    } catch (error) {
      this.logger.error(`[Job ${job.id}] Coupon usage recording failed: ${error?.message}`);
      throw error; // BullMQ will retry
    }
  }
}
