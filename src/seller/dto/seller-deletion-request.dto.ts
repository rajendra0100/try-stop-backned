import { IsString, IsNotEmpty, IsOptional, MaxLength } from "class-validator";

export class CreateSellerDeletionRequestDto {
  @IsString()
  @IsNotEmpty({ message: "Reason for deletion is required" })
  reason: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000, { message: "Message cannot exceed 1000 characters" })
  message?: string;
}
