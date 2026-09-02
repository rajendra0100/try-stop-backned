import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateSettlementStatusDto {
  @IsNotEmpty()
  @IsIn(['unsettled', 'settled'])
  settlementStatus: 'unsettled' | 'settled';

  @IsOptional()
  @IsString()
  utrReference?: string;
}
