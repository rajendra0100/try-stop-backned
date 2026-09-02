import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PopularSearchService } from './popular-search.service';
import { CreatePopularSearchDto } from './dto/create-popular-search.dto';
import { UpdatePopularSearchDto } from './dto/update-popular-search.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller()
export class PopularSearchController {
  constructor(private readonly popularSearchService: PopularSearchService) {}

  // ─── Public Routes (Mobile User App) ───────────────────────────────────────

  /** GET /auth/popular-searches — Top 10 dynamic trending keywords for mobile search screen */
  @SkipThrottle()
  @Get('auth/popular-searches')
  @HttpCode(HttpStatus.OK)
  async getPopularSearches() {
    return this.popularSearchService.getPopularSearches();
  }

  /** POST /auth/track-search-keyword — Automatically records user search query to calculate popularity */
  @SkipThrottle()
  @Post('auth/track-search-keyword')
  @HttpCode(HttpStatus.OK)
  async trackSearchKeyword(@Body('keyword') keyword: string) {
    await this.popularSearchService.trackSearchKeyword(keyword);
    return { success: true };
  }

  // ─── Admin Console Routes ──────────────────────────────────────────────────

  /** GET /admin-auth/popular-searches — Get all search keywords for Admin Control Panel */
  @Get('admin-auth/popular-searches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.SUBADMIN)
  async getAllForAdmin() {
    const data = await this.popularSearchService.getAllForAdmin();
    return { success: true, data };
  }

  /** POST /admin-auth/popular-searches — Admin manually creates or pins a new keyword */
  @Post('admin-auth/popular-searches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.SUBADMIN)
  async createAdminKeyword(@Body() dto: CreatePopularSearchDto) {
    const data = await this.popularSearchService.createAdminKeyword(dto);
    return { success: true, data };
  }

  /** PATCH /admin-auth/popular-searches/:id — Admin pins, unpins, blocks, unblocks, or edits keyword */
  @Patch('admin-auth/popular-searches/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.SUBADMIN)
  async updateAdminKeyword(
    @Param('id') id: string,
    @Body() dto: UpdatePopularSearchDto,
  ) {
    const data = await this.popularSearchService.updateAdminKeyword(id, dto);
    return { success: true, data };
  }

  /** DELETE /admin-auth/popular-searches/:id — Admin deletes a keyword */
  @Delete('admin-auth/popular-searches/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.SUBADMIN)
  async deleteAdminKeyword(@Param('id') id: string) {
    await this.popularSearchService.deleteAdminKeyword(id);
    return { success: true, message: 'Search keyword deleted successfully' };
  }
}
