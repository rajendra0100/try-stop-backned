import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
  applyDecorators,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Metadata key for the required permission string.
 * Used by the @RequirePermission() decorator below.
 */
export const PERMISSION_KEY = 'required_permission';

/**
 * PermissionGuard — single, reusable guard for admin/subadmin permission checks.
 *
 * Logic:
 *   - Superadmin  → always passes (automatic bypass, no permission check)
 *   - Subadmin    → passes only if their `permissions` array includes the required permission
 *   - Any other role → denied (ForbiddenException)
 *
 * This guard must always be used AFTER JwtAuthGuard (so req.user is populated).
 * The @RequirePermission() convenience decorator stacks both guards automatically.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride<string>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permission metadata is set, allow (guard used without decorator — shouldn't happen)
    if (!requiredPermission) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.role) {
      throw new ForbiddenException('Authentication required');
    }

    // Superadmin always passes — no permission check ever applies
    if (user.role === Role.SUPERADMIN) return true;

    // Subadmin must have the specific permission in their array
    if (user.role === Role.SUBADMIN) {
      const permissions: string[] = user.permissions ?? [];
      if (permissions.includes(requiredPermission)) return true;
      throw new ForbiddenException(
        `You do not have the '${requiredPermission}' permission`,
      );
    }

    // Any other role (seller, user, rider) is denied
    throw new ForbiddenException(
      'Only admin or authorized subadmin can perform this action',
    );
  }
}

/**
 * @RequirePermission('manage_products') — convenience decorator.
 *
 * Stacks JwtAuthGuard + PermissionGuard with the specified permission key.
 * Usage:
 *   @RequirePermission('manage_products')
 *   @Patch(':id/approve')
 *   approveProduct() { ... }
 */
export function RequirePermission(permission: string) {
  return applyDecorators(
    SetMetadata(PERMISSION_KEY, permission),
    UseGuards(JwtAuthGuard, PermissionGuard),
  );
}
