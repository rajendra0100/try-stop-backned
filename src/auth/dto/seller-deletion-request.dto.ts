import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSellerDeletionRequestDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsNotEmpty()
  @IsString()
  message: string;
}

export class UpdateSellerDeletionRequestStatusDto {
  @IsNotEmpty()
  @IsString()
  status: 'pending' | 'contacted' | 'resolved';

  @IsOptional()
  @IsString()
  adminNotes?: string;
}
