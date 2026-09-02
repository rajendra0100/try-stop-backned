import {
  IsNotEmpty, IsNumber, IsOptional, IsString, IsIn, IsMongoId, Min,
} from 'class-validator';

/**
 * DTO for crediting wallet (admin-only).
 * Supports single-user credit or broadcast credit to all users.
 */
export class WalletCreditDto {
  @IsNotEmpty()
  @IsIn(['user', 'all'])
  target: 'user' | 'all';

  /** Required when target = "user" */
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
