import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { Roles } from './common/decorators/roles.decorator';
import { Role } from './common/enums/role.enum';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Sample Protected Route: POST /products
   * Restricted to: SELLER, SUPERADMIN, and SUBADMIN.
   *
   * Usage Example:
   * Header: Authorization: Bearer <JWT_ACCESS_TOKEN>
   */
  @Post('products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER, Role.SUPERADMIN, Role.SUBADMIN)
  createProduct(): object {
    return {
      message: 'Product created successfully (Authorized)',
      timestamp: new Date().toISOString(),
    };
  }
}

