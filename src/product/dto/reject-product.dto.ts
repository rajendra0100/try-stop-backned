import { IsNotEmpty, IsString } from 'class-validator';

/** DTO for rejecting a product — requires a reason */
export class RejectProductDto {
  @IsNotEmpty()
  @IsString()
  reason: string;
}
