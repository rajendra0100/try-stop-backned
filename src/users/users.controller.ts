import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { UpdateUserDto } from "./dto/update-user.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/enums/role.enum";
import { SkipThrottle } from "@nestjs/throttler";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN, Role.SUBADMIN)
@SkipThrottle()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * List all registered customers — protected, admin/subadmin only.
   * GET /users
   */
  @Get()
  async listUsers(
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("search") search?: string,
  ) {
    return this.usersService.listUsers(page, limit, search);
  }

  /**
   * Get rich user details including all store transactions and purchased vouchers.
   * GET /users/:id/details
   */
  @Get(":id/details")
  async getUserDetails(@Param("id") id: string) {
    return this.usersService.getUserDetails(id);
  }

  /**
   * GET /users/:id
   */
  @Get(":id")
  async getUserById(@Param("id") id: string) {
    return this.usersService.getUserDetails(id);
  }

  /**
   * Update user details and wallet balance.
   * PATCH /users/:id
   */
  @Patch(":id")
  async updateUser(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(id, dto);
  }

  /**
   * Delete a user.
   * DELETE /users/:id
   */
  @Delete(":id")
  async deleteUser(@Param("id") id: string) {
    return this.usersService.deleteUser(id);
  }
}
