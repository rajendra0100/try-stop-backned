import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletTransactionDocument = WalletTransaction & Document;

/**
 * WalletTransaction Schema — the wallet ledger (source of truth for balances).
 *
 * Every wallet operation (cashback credit, redemption debit, admin credit, promo)
 * creates one immutable ledger entry. The User.walletBalance field is a denormalized
 * cache updated atomically alongside each ledger write.
 *
 * The ledger is the audit trail — never store just a single "balance" number.
 */
@Schema({ timestamps: true })
export class WalletTransaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: ['credit', 'debit'] })
  type: 'credit' | 'debit';

  @Prop({ required: true })
  amount: number;

  @Prop({
    required: true,
    enum: ['cashback', 'wallet_redemption', 'admin_credit', 'promo_credit', 'referral_reward'],
  })
  reason: 'cashback' | 'wallet_redemption' | 'admin_credit' | 'promo_credit' | 'referral_reward';

  /** Links back to the payment transaction, if applicable */
  @Prop({ type: Types.ObjectId, ref: 'Transaction', default: null })
  relatedTransactionId: Types.ObjectId | null;

  /** Optional admin note for admin_credit / promo_credit */
  @Prop({ type: String, default: null })
  note: string | null;
}

export const WalletTransactionSchema = SchemaFactory.createForClass(WalletTransaction);

// ─── Indexes ────────────────────────────────────────────────────────────────
// User's wallet history (sorted by date)
WalletTransactionSchema.index({ userId: 1, createdAt: -1 });
// Prevent double-crediting cashback for the same payment transaction
WalletTransactionSchema.index({ relatedTransactionId: 1, reason: 1 });
