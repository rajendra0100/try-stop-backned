import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TransactionDocument = Transaction & Document;

@Schema({ _id: false })
export class TransactionItem {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  price: number;

  @Prop({ default: 1 })
  quantity?: number;
}

export const TransactionItemSchema = SchemaFactory.createForClass(TransactionItem);

/**
 * Transaction Schema — the core payment ledger.
 *
 * Every in-store QR payment creates one Transaction record.
 * Stores the full financial breakdown at the time of creation so past
 * transactions are never affected by future rate changes (audit-safe).
 *
 * Settlement fields are updated by the nightly cron (§2.3).
 */
@Schema({ timestamps: true })
export class Transaction {
  /** The customer who paid */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  customerId: Types.ObjectId;

  /** The seller who received the payment */
  @Prop({ type: Types.ObjectId, ref: 'Seller', required: true })
  sellerId: Types.ObjectId;

  /** Cashfree order ID — used as idempotency key for webhook processing */
  @Prop({ required: true })
  cashfreeOrderId: string;

  /** Gross bill amount (full price the customer sees) */
  @Prop({ required: true })
  totalAmount: number;

  /** Amount paid from customer's wallet */
  @Prop({ default: 0 })
  walletAmountUsed: number;

  /** Amount paid from customer's voucher balance */
  @Prop({ default: 0 })
  voucherAmountUsed: number;

  /** Amount charged online via UPI/PG (totalAmount - walletAmountUsed) */
  @Prop({ required: true })
  amountPaidOnline: number;

  /** Coupon code applied, if any */
  @Prop({ type: String, default: null })
  couponCode: string | null;

  /** Discount from coupon */
  @Prop({ default: 0 })
  couponDiscount: number;

  // ─── Financial Breakdown (snapshot at creation time) ─────────────────────

  /** Commission rate applied for this transaction (e.g. 0.15 = 15%) */
  @Prop({ required: true })
  appliedCommissionRate: number;

  /** Trystop commission amount = totalAmount × commissionRate */
  @Prop({ required: true })
  commissionAmount: number;

  /** Total PG fee = totalAmount × 0.02 (2% of gross, regardless of payment method) */
  @Prop({ required: true })
  pgFeeTotal: number;

  /** Trystop's share of PG fee (50% of pgFeeTotal) */
  @Prop({ required: true })
  pgFeeTrystopShare: number;

  /** Seller's share of PG fee */
  @Prop({ required: true })
  pgFeeSellerShare: number;

  /** Applied PG fee rate for seller (e.g. 0.008 = 0.8%, 0.005 = 0.5%) */
  @Prop({ type: Number, default: 0.008 })
  appliedPgFeeRate?: number;

  /** Seller's net payout = totalAmount - commissionAmount - pgFeeSellerShare */
  @Prop({ required: true })
  sellerNetPayout: number;

  /** Cashback earned by customer (based on amountPaidOnline only) */
  @Prop({ default: 0 })
  cashbackEarned: number;

  /** Cashback rate applied for this transaction */
  @Prop({ default: 0 })
  appliedCashbackRate: number;

  /** Itemized product list added by seller for record keeping */
  @Prop({ type: [TransactionItemSchema], default: [] })
  items?: TransactionItem[];

  // ─── Payment Status ───────────────────────────────────────────────────────

  @Prop({
    required: true,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
  })
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';

  /** Raw Cashfree payment status from webhook */
  @Prop({ type: String, default: null })
  cashfreePaymentStatus: string | null;

  /** Timestamp when payment was confirmed via webhook */
  @Prop({ type: Date, default: null })
  paidAt: Date | null;

  /** Whether the payment has been double-confirmed via direct gateway API */
  @Prop({ type: Boolean, default: false })
  isGatewayDoubleConfirmed: boolean;

  /** Cashfree Payment ID (cf_payment_id) from gateway */
  @Prop({ type: String, default: null })
  gatewayPaymentId: string | null;

  /** Bank Reference Number / RRN from payment gateway */
  @Prop({ type: String, default: null })
  bankReferenceNumber: string | null;

  /** Payment method used on gateway (e.g. upi, card, netbanking, wallet) */
  @Prop({ type: String, default: null })
  gatewayPaymentMethod: string | null;

  /** Timestamp when payment was double-confirmed with gateway */
  @Prop({ type: Date, default: null })
  gatewayDoubleConfirmedAt: Date | null;

  /** Reason if payment failed or was cancelled */
  @Prop({ type: String, default: null })
  failureReason: string | null;

  // ─── Settlement Status (updated by nightly cron) ──────────────────────────

  @Prop({
    enum: ['unsettled', 'settled'],
    default: 'unsettled',
  })
  settlementStatus: 'unsettled' | 'settled';

  /** Cashfree payout transfer ID after settlement */
  @Prop({ type: String, default: null })
  settlementId: string | null;

  /** UTR reference from bank after settlement */
  @Prop({ type: String, default: null })
  utrReference: string | null;

  /** Date of settlement run */
  @Prop({ type: Date, default: null })
  settledAt: Date | null;

  /** Settlement error message if failed */
  @Prop({ type: String, default: null })
  settlementError: string | null;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

// ─── Indexes ────────────────────────────────────────────────────────────────
// Webhook lookup by Cashfree order ID (unique — also serves as idempotency key)
TransactionSchema.index({ cashfreeOrderId: 1 }, { unique: true });
// Seller's transaction history (sorted by date)
TransactionSchema.index({ sellerId: 1, createdAt: -1 });
// Customer's transaction history
TransactionSchema.index({ customerId: 1, createdAt: -1 });
// Nightly settlement: find all paid+unsettled transactions for a given day
TransactionSchema.index({ paymentStatus: 1, settlementStatus: 1, paidAt: 1 });
// Seller ranking: 30-day rolling window count per seller
TransactionSchema.index({ sellerId: 1, paymentStatus: 1, paidAt: 1 });
TransactionSchema.index({ paymentStatus: 1, paidAt: 1, sellerId: 1 });
