import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { PolicyService } from './policy.service';
import { UpdatePolicyDto } from './dto/policy.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequirePermission } from '../common/guards/permission.guard';

@Controller('policies')
export class PolicyController {
  constructor(private readonly policyService: PolicyService) {}

  /**
   * GET /policies/:type
   * Public endpoint to get a specific policy configuration (e.g. voucher_guidelines).
   */
  @Get(':type')
  async getPolicy(@Param('type') type: string) {
    return this.policyService.getPolicy(type);
  }

  /**
   * PUT /policies/:type
   * Protected endpoint for Admin to update policy guidelines.
   */
  @Put(':type')
  @UseGuards(JwtAuthGuard)
  @RequirePermission('manage_settings')
  async updatePolicy(
    @Param('type') type: string,
    @Body() dto: UpdatePolicyDto,
  ) {
    return this.policyService.updatePolicy(type, dto);
  }
}
