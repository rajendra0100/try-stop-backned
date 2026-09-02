import {
  IsNotEmpty, IsString, IsNumber, IsOptional, IsMongoId, Min,
} from 'class-validator';

/**
 * DTO for creating a payment order (Scan to Pay flow).
 *
 * The customer (or seller's staff) submits the bill amount and optionally
 * chooses to apply wallet balance. Backend validates wallet cap and creates
 * a Cashfree order for the amountToChargeOnline.
 */
export class CreateOrderDto {
  /** The seller being paid */
  @IsNotEmpty()
  @IsMongoId()
  sellerId: string;

  /** Total bill amount */
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  totalAmount: number;

  /** Optional — how much the customer wants to pay from wallet */
  @IsOptional()
  @IsNumber()
  @Min(0)
  useWalletAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  useVoucherAmount?: number;

  /** Optional coupon code */
  @IsOptional()
  @IsString()
  couponCode?: string;
}
