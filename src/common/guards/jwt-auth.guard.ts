import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      if (info && (info.name === 'TokenExpiredError' || info.message === 'jwt expired')) {
        throw new UnauthorizedException('Session has expired. Please log in again.');
      }
      throw err || new UnauthorizedException('Authentication token is missing or invalid');
    }
    return user;
  }
}
