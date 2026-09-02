import { IsString, Length, Matches, IsOptional } from "class-validator";

export class SetSellerPasscodeDto {
  @IsString()
  @Length(4, 4, { message: "Passcode must be exactly 4 digits" })
  @Matches(/^[0-9]{4}$/, { message: "Passcode must contain digits only" })
  passcode: string;
}

export class VerifySellerPasscodeDto {
  @IsString()
  @Length(4, 4, { message: "Passcode must be exactly 4 digits" })
  @Matches(/^[0-9]{4}$/, { message: "Passcode must contain digits only" })
  passcode: string;
}

export class ResetSellerPasscodeDto {
  @IsString()
  otp: string;

  @IsString()
  @Length(4, 4, { message: "New passcode must be exactly 4 digits" })
  @Matches(/^[0-9]{4}$/, { message: "New passcode must contain digits only" })
  newPasscode: string;
}

export class ChangeSellerPasscodeDto {
  @IsString()
  @Length(4, 4, { message: "Current passcode must be exactly 4 digits" })
  @Matches(/^[0-9]{4}$/, { message: "Current passcode must contain digits only" })
  currentPasscode: string;

  @IsString()
  @Length(4, 4, { message: "New passcode must be exactly 4 digits" })
  @Matches(/^[0-9]{4}$/, { message: "New passcode must contain digits only" })
  newPasscode: string;
}

export class UpdateSellerBankDetailsDto {
  @IsString()
  accountHolderName: string;

  @IsString()
  bankAccountNumber: string;

  @IsString()
  ifscCode: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsString()
  upiId?: string;

  @IsOptional()
  @IsString()
  passcode?: string;
}
