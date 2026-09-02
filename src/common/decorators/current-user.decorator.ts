import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserDocument } from '../../auth/schemas/user.schema';

/**
 * @CurrentUser() — extracts the authenticated user from the request.
 *
 * Usage in a controller (replaces @Req() req: any + req.user):
 *
 *   @Get('profile')
 *   @UseGuards(JwtAuthGuard)
 *   getProfile(@CurrentUser() user: UserDocument) {
 *     return user;
 *   }
 *
 * Populated by JwtStrategy.validate() after a valid JWT is verified.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserDocument => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
