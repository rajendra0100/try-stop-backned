import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Role } from '../../common/enums/role.enum';

/** Roles that require password-based authentication */
const PRIVILEGED_ROLES = [Role.SUPERADMIN, Role.SUBADMIN];

/**
 * DTO for admin/superadmin login (password-based).
 * Regular users (USER, SELLER, RIDER) use OTP-based auth — not this DTO.
 */
export class AdminLoginDto {
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsNotEmpty({ message: 'Password is required' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @IsOptional()
  @IsEnum(PRIVILEGED_ROLES, {
    message: `Role must be one of: ${PRIVILEGED_ROLES.join(', ')}`,
  })
  role?: Role;
}
