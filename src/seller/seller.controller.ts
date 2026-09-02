import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { SellerService } from "./seller.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import {
  SetSellerPasscodeDto,
  VerifySellerPasscodeDto,
  ResetSellerPasscodeDto,
  ChangeSellerPasscodeDto,
  UpdateSellerBankDetailsDto,
} from "./dto/seller-passcode.dto";
import { CreateSellerDeletionRequestDto } from "./dto/seller-deletion-request.dto";
import {
  OnboardStaffDto,
  VerifyStaffOtpDto,
  ResendStaffOtpDto,
  UpdateStaffDto,
  ToggleStaffPermissionDto,
} from "./dto/staff.dto";

@Controller("seller")
export class SellerController {
  constructor(private readonly sellerService: SellerService) {}

  /** Get dashboard metrics for authenticated seller */
  @UseGuards(JwtAuthGuard)
  @Get("dashboard/stats")
  async getDashboardStats(@CurrentUser() user: any) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.getSellerDashboardStats(sellerId.toString());
  }

  /** Get shop visitor traffic & reach analytics for authenticated seller */
  @UseGuards(JwtAuthGuard)
  @Get("shop-analytics")
  async getShopAnalytics(@CurrentUser() user: any) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.getSellerShopAnalytics(sellerId.toString());
  }

  /** Get all stories for authenticated seller */
  @UseGuards(JwtAuthGuard)
  @Get("stories")
  async getSellerStories(@CurrentUser() user: any) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.getSellerStories(sellerId.toString());
  }

  /** Publish single or multiple stories for authenticated seller */
  @UseGuards(JwtAuthGuard)
  @Post("stories")
  async addStories(@CurrentUser() user: any, @Body() body: any) {
    const sellerId = user._id || user.id || user.sub;
    const storiesArray = Array.isArray(body)
      ? body
      : Array.isArray(body.stories)
      ? body.stories
      : [body];
    return this.sellerService.addSellerStories(sellerId.toString(), storiesArray);
  }

  /** Delete a story permanently */
  @UseGuards(JwtAuthGuard)
  @Delete("stories/:storyId")
  async deleteStory(
    @CurrentUser() user: any,
    @Param("storyId") storyId: string,
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.deleteSellerStory(sellerId.toString(), storyId);
  }

  /** Toggle hide/unhide story from public */
  @UseGuards(JwtAuthGuard)
  @Patch("stories/:storyId/visibility")
  async toggleHideStory(
    @CurrentUser() user: any,
    @Param("storyId") storyId: string,
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.toggleHideSellerStory(sellerId.toString(), storyId);
  }

  /** Record story view by customers (Public) */
  @Post("stories/:sellerId/:storyId/view")
  async recordStoryView(
    @Param("sellerId") sellerId: string,
    @Param("storyId") storyId: string,
    @Body() body?: { userId?: string; userName?: string },
  ) {
    return this.sellerService.recordStoryView(
      sellerId,
      storyId,
      body?.userId,
      body?.userName,
    );
  }

  /** Track customer visit to shop details (Public) */
  @Post(":sellerId/track-visit")
  async trackStoreVisit(@Param("sellerId") sellerId: string) {
    return this.sellerService.trackStoreVisit(sellerId);
  }

  /** Track customer action like directions or calls (Public) */
  @Post(":sellerId/track-action")
  async trackStoreAction(
    @Param("sellerId") sellerId: string,
    @Body() body: { action: string },
  ) {
    return this.sellerService.trackStoreAction(sellerId, body?.action);
  }

  /** Get notifications for authenticated seller with pagination */
  @UseGuards(JwtAuthGuard)
  @Get("notifications")
  async getSellerNotifications(
    @CurrentUser() user: any,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.getSellerNotifications(sellerId.toString(), page, limit);
  }

  /** Mark seller notifications as read */
  @UseGuards(JwtAuthGuard)
  @Patch("notifications/read")
  async markNotificationsRead(
    @CurrentUser() user: any,
    @Body() body?: { notificationId?: string },
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.markSellerNotificationRead(
      sellerId.toString(),
      body?.notificationId,
    );
  }

  /** Submit merchant account deletion request with reason & feedback */
  @UseGuards(JwtAuthGuard)
  @Post("deletion-request")
  async submitDeletionRequest(
    @CurrentUser() user: any,
    @Body() dto: CreateSellerDeletionRequestDto,
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.submitSellerDeletionRequest(sellerId.toString(), dto);
  }

  /** Get security passcode status & bank details configuration for seller */
  @UseGuards(JwtAuthGuard)
  @Get("passcode/status")
  async getPasscodeStatus(@CurrentUser() user: any) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.getSellerPasscodeStatus(sellerId.toString());
  }

  /** Set up 4-digit security passcode for seller */
  @UseGuards(JwtAuthGuard)
  @Post("passcode/set")
  @HttpCode(HttpStatus.OK)
  async setPasscode(
    @CurrentUser() user: any,
    @Body() dto: SetSellerPasscodeDto,
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.setSellerPasscode(sellerId.toString(), dto);
  }

  /** Verify 4-digit security passcode and get bank details */
  @UseGuards(JwtAuthGuard)
  @Post("passcode/verify")
  @HttpCode(HttpStatus.OK)
  async verifyPasscode(
    @CurrentUser() user: any,
    @Body() dto: VerifySellerPasscodeDto,
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.verifySellerPasscode(sellerId.toString(), dto);
  }

  /** Request OTP for passcode reset */
  @UseGuards(JwtAuthGuard)
  @Post("passcode/forgot-otp")
  @HttpCode(HttpStatus.OK)
  async sendPasscodeOtp(@CurrentUser() user: any) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.sendSellerPasscodeOtp(sellerId.toString());
  }

  /** Verify OTP and reset security passcode */
  @UseGuards(JwtAuthGuard)
  @Post("passcode/reset")
  @HttpCode(HttpStatus.OK)
  async resetPasscode(
    @CurrentUser() user: any,
    @Body() dto: ResetSellerPasscodeDto,
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.resetSellerPasscodeWithOtp(sellerId.toString(), dto);
  }

  /** Change security passcode */
  @UseGuards(JwtAuthGuard)
  @Post("passcode/change")
  @HttpCode(HttpStatus.OK)
  async changePasscode(
    @CurrentUser() user: any,
    @Body() dto: ChangeSellerPasscodeDto,
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.changeSellerPasscode(sellerId.toString(), dto);
  }

  /** Get bank details */
  @UseGuards(JwtAuthGuard)
  @Get("bank-details")
  async getBankDetails(@CurrentUser() user: any) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.getSellerBankDetails(sellerId.toString());
  }

  /** Update or save bank details */
  @UseGuards(JwtAuthGuard)
  @Patch("bank-details")
  async updateBankDetails(
    @CurrentUser() user: any,
    @Body() dto: UpdateSellerBankDetailsDto,
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.updateSellerBankDetails(sellerId.toString(), dto);
  }

  /** Update seller shop media */
  @UseGuards(JwtAuthGuard)
  @Put("media")
  async updateSellerMedia(
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.updateSellerMedia(sellerId.toString(), body);
  }
  // ─── STAFF / STORE EXECUTIVES ─────────────────────────────────────────────

  /** Get all staff members for authenticated seller */
  @UseGuards(JwtAuthGuard)
  @Get("staff")
  async getStaffMembers(
    @CurrentUser() user: any,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("search") search?: string,
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.getStaffMembers(sellerId.toString(), page, limit, search);
  }

  /** Onboard a new staff member and dispatch email OTP */
  @UseGuards(JwtAuthGuard)
  @Post("staff/onboard")
  @HttpCode(HttpStatus.OK)
  async onboardStaff(
    @CurrentUser() user: any,
    @Body() dto: OnboardStaffDto,
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.onboardStaffMember(sellerId.toString(), dto);
  }

  /** Verify email OTP and activate staff member */
  @UseGuards(JwtAuthGuard)
  @Post("staff/verify-otp")
  @HttpCode(HttpStatus.OK)
  async verifyStaffOtp(
    @CurrentUser() user: any,
    @Body() dto: VerifyStaffOtpDto,
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.verifyStaffOtp(sellerId.toString(), dto);
  }

  /** Resend verification email OTP */
  @UseGuards(JwtAuthGuard)
  @Post("staff/resend-otp")
  @HttpCode(HttpStatus.OK)
  async resendStaffOtp(
    @CurrentUser() user: any,
    @Body() dto: ResendStaffOtpDto,
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.resendStaffOtp(sellerId.toString(), dto);
  }

  /** Update staff member name and permissions */
  @UseGuards(JwtAuthGuard)
  @Patch("staff/:id")
  async updateStaff(
    @CurrentUser() user: any,
    @Param("id") staffId: string,
    @Body() dto: UpdateStaffDto,
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.updateStaffMember(sellerId.toString(), staffId, dto);
  }

  /** Delete a staff member */
  @UseGuards(JwtAuthGuard)
  @Delete("staff/:id")
  async deleteStaff(
    @CurrentUser() user: any,
    @Param("id") staffId: string,
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.deleteStaffMember(sellerId.toString(), staffId);
  }

  /** Toggle specific staff permission */
  @UseGuards(JwtAuthGuard)
  @Patch("staff/:id/permission")
  async toggleStaffPermission(
    @CurrentUser() user: any,
    @Param("id") staffId: string,
    @Body() body: ToggleStaffPermissionDto,
  ) {
    const sellerId = user._id || user.id || user.sub;
    return this.sellerService.toggleStaffPermission(
      sellerId.toString(),
      staffId,
      body.permissionKey,
      body.value,
    );
  }
}
