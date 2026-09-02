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

/** Roles that are created via admin panel with password */
const ADMIN_ROLES = [Role.SUPERADMIN, Role.SUBADMIN];

/**
 * DTO for creating admin accounts (superadmin / subadmin).
 * These accounts use password-based login.
 *
 * Regular users are auto-registered/verified via OTP — no separate signup needed.
 */
export class CreateAdminDto {
  @IsNotEmpty({ message: 'Name is required' })
  @IsString()
  name: string;

  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsNotEmpty({ message: 'Password is required' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @IsNotEmpty({ message: 'Role is required' })
  @IsEnum(ADMIN_ROLES, {
    message: `Role must be one of: ${ADMIN_ROLES.join(', ')}`,
  })
  role: Role;

  /**
   * Bootstrap secret — required when creating the very first superadmin
   * before any other superadmin exists in the system.
   */
  @IsOptional()
  @IsString()
  superAdminSecret?: string;
}
