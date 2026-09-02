import {
  IsNotEmpty,
  IsString,
  Matches,
  IsOptional,
  MinLength,
} from 'class-validator';

export class SetSellerPasscodeDto {
  @IsNotEmpty({ message: 'Passcode is required' })
  @IsString()
  @Matches(/^[0-9]{4}$/, {
    message: 'Passcode must be a 4-digit numeric PIN',
  })
  passcode: string;
}

export class VerifySellerPasscodeDto {
  @IsNotEmpty({ message: 'Passcode is required' })
  @IsString()
  @Matches(/^[0-9]{4}$/, {
    message: 'Passcode must be a 4-digit numeric PIN',
  })
  passcode: string;
}

export class ResetSellerPasscodeDto {
  @IsNotEmpty({ message: 'OTP is required' })
  @IsString()
  otp: string;

  @IsNotEmpty({ message: 'New passcode is required' })
  @IsString()
  @Matches(/^[0-9]{4}$/, {
    message: 'New passcode must be a 4-digit numeric PIN',
  })
  newPasscode: string;
}

export class ChangeSellerPasscodeDto {
  @IsNotEmpty({ message: 'Current passcode is required' })
  @IsString()
  currentPasscode: string;

  @IsNotEmpty({ message: 'New passcode is required' })
  @IsString()
  @Matches(/^[0-9]{4}$/, {
    message: 'New passcode must be a 4-digit numeric PIN',
  })
  newPasscode: string;
}

export class UpdateSellerBankDetailsDto {
  @IsOptional()
  @IsString()
  passcode?: string;

  @IsNotEmpty({ message: 'Account holder name is required' })
  @IsString()
  @MinLength(2, { message: 'Account holder name must be at least 2 characters' })
  accountHolderName: string;

  @IsNotEmpty({ message: 'Bank account number is required' })
  @IsString()
  @Matches(/^[0-9]{9,18}$/, {
    message: 'Bank account number must be between 9 and 18 digits',
  })
  bankAccountNumber: string;

  @IsNotEmpty({ message: 'IFSC code is required' })
  @IsString()
  @Matches(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, {
    message: 'IFSC must be in valid 11-character format (e.g. SBIN0001234)',
  })
  ifscCode: string;

  @IsNotEmpty({ message: 'Bank name is required' })
  @IsString()
  @MinLength(2, { message: 'Bank name must be at least 2 characters' })
  bankName: string;

  @IsNotEmpty({ message: 'Branch name is required' })
  @IsString()
  @MinLength(2, { message: 'Branch name must be at least 2 characters' })
  branchName: string;

  @IsNotEmpty({ message: 'UPI ID is required' })
  @IsString()
  @Matches(/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/, {
    message: 'Enter a valid UPI ID (e.g. merchant@oksbi or name@upi)',
  })
  upiId: string;
}
