import {
  IsNotEmpty, IsNumber, IsOptional, IsString, IsMongoId, Min, Max,
} from 'class-validator';

export class CreateReviewDto {
  @IsNotEmpty()
  @IsMongoId()
  sellerId: string;

  @IsNotEmpty()
  @IsMongoId()
  transactionId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.5)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
