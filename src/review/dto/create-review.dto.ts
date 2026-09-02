import {
  IsNotEmpty, IsNumber, IsOptional, IsString, IsMongoId, Min, Max,
} from 'class-validator';

/**
 * DTO for creating a review.
 * Customer-only — must own a successful transaction with the sellerId.
 */
export class CreateReviewDto {
  @IsNotEmpty()
  @IsMongoId()
  sellerId: string;

  @IsNotEmpty()
  @IsMongoId()
  transactionId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
