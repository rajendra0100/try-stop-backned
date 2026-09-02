import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AdminThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger('AdminThrottlerGuard');

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const url = request.url;

    // Bypass rate limiting for all user-facing mobile & admin endpoints
    if (
      url.includes('/admin') ||
      url.startsWith('/admin-auth') ||
      url.startsWith('/users') ||
      url.startsWith('/auth') ||
      url.startsWith('/sellers') ||
      url.startsWith('/banners') ||
      url.startsWith('/categories') ||
      url.startsWith('/home') ||
      url.startsWith('/wallet') ||
      url.startsWith('/reviews') ||
      url.startsWith('/offers') ||
      url.startsWith('/notifications') ||
      url.startsWith('/payments') ||
      url.startsWith('/ads') ||
      url.startsWith('/products') ||
      url.startsWith('/referral')
    ) {
      return true;
    }

    try {
      const tracker = await this.getTracker(request);
      this.logger.log(
        `[Throttler] Request URL: ${url} | IP: ${request.ip} | Tracker Key: ${tracker} | Headers: ${JSON.stringify({
          'x-forwarded-for': request.headers['x-forwarded-for'],
          'x-real-ip': request.headers['x-real-ip'],
        })}`,
      );

      const result = await super.canActivate(context);
      this.logger.log(`[Throttler] Result for ${url}: ${result ? 'ALLOWED' : 'THROTTLED'}`);
      return result;
    } catch (err: any) {
      this.logger.error(`[Throttler] Exception checking throttle for ${url}: ${err.message}`);
      throw err;
    }
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip;
    const cleanIp = Array.isArray(ip) ? ip[0] : (ip || 'unknown');

    if (req.user && req.user._id) {
      return `user:${req.user._id.toString()}`;
    }
    return `ip:${cleanIp}`;
  }
}
