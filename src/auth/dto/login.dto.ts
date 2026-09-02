import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export class LoginDto {
  @IsNotEmpty()
  @IsString()
  identifier: string; // Can be email or phone

  @IsNotEmpty()
  @IsString()
  password: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
