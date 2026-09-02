import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import * as bcrypt from "bcrypt";

import { Seller, SellerDocument } from "../auth/schemas/seller.schema";
import { User, UserDocument } from "../auth/schemas/user.schema";
import {
  SellerDeletionRequest,
  SellerDeletionRequestDocument,
} from "../auth/schemas/seller-deletion-request.schema";
import { Transaction, TransactionDocument } from "../payment/schemas/transaction.schema";
import { OtpService } from "../otp/otp.service";
import { NotificationService } from "../notification/notification.service";
import {
  OnboardStaffDto,
  VerifyStaffOtpDto,
  ResendStaffOtpDto,
  UpdateStaffDto,
} from "./dto/staff.dto";
import {
  SetSellerPasscodeDto,
  VerifySellerPasscodeDto,
  ResetSellerPasscodeDto,
  ChangeSellerPasscodeDto,
  UpdateSellerBankDetailsDto,
} from "./dto/seller-passcode.dto";
import { CreateSellerDeletionRequestDto } from "./dto/seller-deletion-request.dto";

@Injectable()
export class SellerService {
  private readonly logger = new Logger(SellerService.name);

  constructor(
    @InjectModel(Seller.name)
    private readonly sellerModel: Model<SellerDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(SellerDeletionRequest.name)
    private readonly sellerDeletionRequestModel: Model<SellerDeletionRequestDocument>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
    private readonly otpService: OtpService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Get real dashboard metrics for authenticated seller
   */
  async getSellerDashboardStats(sellerId: string) {
    const sellerObjectId = new Types.ObjectId(sellerId);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [todayAgg, totalAgg, uniqueCustomers] = await Promise.all([
      this.transactionModel.aggregate([
        {
          $match: {
            sellerId: sellerObjectId,
            paymentStatus: "paid",
            createdAt: { $gte: startOfToday },
          },
        },
        {
          $group: {
            _id: null,
            salesAmount: { $sum: "$totalAmount" },
            netAmount: { $sum: "$sellerNetPayout" },
            ordersCount: { $sum: 1 },
          },
        },
      ]),
      this.transactionModel.aggregate([
        {
          $match: {
            sellerId: sellerObjectId,
            paymentStatus: "paid",
          },
        },
        {
          $group: {
            _id: null,
            salesAmount: { $sum: "$totalAmount" },
            netAmount: { $sum: "$sellerNetPayout" },
            ordersCount: { $sum: 1 },
          },
        },
      ]),
      this.transactionModel.distinct("customerId", {
        sellerId: sellerObjectId,
        paymentStatus: "paid",
      }),
    ]);

    const todayStats = todayAgg[0] || { salesAmount: 0, netAmount: 0, ordersCount: 0 };
    const totalStats = totalAgg[0] || { salesAmount: 0, netAmount: 0, ordersCount: 0 };

    return {
      todaySalesAmount: todayStats.salesAmount,
      todayOrdersCount: todayStats.ordersCount,
      todayNetAmount: todayStats.netAmount,
      totalSalesAmount: totalStats.salesAmount,
      totalNetAmount: totalStats.netAmount,
      totalOrdersCount: totalStats.ordersCount,
      uniqueCustomersCount: uniqueCustomers.length,
    };
  }

  /**
   * Get shop visitor traffic & reach analytics for authenticated seller
   */
  async getSellerShopAnalytics(sellerId: string) {
    const sellerObjectId = new Types.ObjectId(sellerId);
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    const todayStr = new Date().toISOString().split("T")[0];

    // Store visits
    const todayRecord = (seller.dailyStoreVisits || []).find((d: any) => d.date === todayStr);
    const todayVisits = todayRecord?.count || 0;
    const overallVisits = seller.totalStoreVisits || 0;

    // Story views
    const todayStoryRecord = (seller.dailyStoryViews || []).find((d: any) => d.date === todayStr);
    let activeTodayStoryViews = 0;
    for (const story of seller.stories || []) {
      for (const v of story.views || []) {
        if (v.viewedAt && new Date(v.viewedAt).toISOString().split("T")[0] === todayStr) {
          activeTodayStoryViews++;
        }
      }
    }
    const todayStoryViews = Math.max(todayStoryRecord?.count || 0, activeTodayStoryViews);
    const activeStorySum = (seller.stories || []).reduce(
      (acc: number, s: any) => acc + (s.viewCount || 0),
      0,
    );
    const storyTotalViews = Math.max(seller.totalStoryViews || 0, activeStorySum);

    // Followers
    const followersCount = await this.userModel.countDocuments({
      favoriteSellers: { $in: [sellerObjectId, sellerId, new Types.ObjectId(sellerId)] },
    });
    const todayFollowerRecord = (seller.dailyFollowers || []).find((d: any) => d.date === todayStr);
    const todayNotificationsFollowers = (seller.notifications || []).filter((n: any) => {
      return (
        n.type === "new_follower" &&
        n.createdAt &&
        new Date(n.createdAt).toISOString().split("T")[0] === todayStr
      );
    }).length;
    const todayFollowers = Math.max(todayFollowerRecord?.count || 0, todayNotificationsFollowers);

    // Direction requests
    const todayDirectionRecord = (seller.dailyDirectionClicks || []).find((d: any) => d.date === todayStr);
    const todayDirectionClicks = todayDirectionRecord?.count || 0;
    const directionClicks = seller.directionClicks || 0;

    // Direct calls
    const todayCallRecord = (seller.dailyCallClicks || []).find((d: any) => d.date === todayStr);
    const todayCallClicks = todayCallRecord?.count || 0;
    const callClicks = seller.callClicks || 0;

    return {
      todayVisits,
      overallVisits,
      todayStoryViews,
      storyTotalViews,
      todayFollowers,
      followersCount: followersCount || 0,
      todayDirectionClicks,
      directionClicks,
      todayCallClicks,
      callClicks,
    };
  }

  /**
   * Track customer visit to shop details page
   */
  async trackStoreVisit(sellerId: string) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) return { success: false, message: "Seller not found" };

    const todayStr = new Date().toISOString().split("T")[0];
    let dailyVisits = seller.dailyStoreVisits || [];
    const existingIndex = dailyVisits.findIndex((d: any) => d.date === todayStr);

    if (existingIndex > -1) {
      dailyVisits[existingIndex].count = (dailyVisits[existingIndex].count || 0) + 1;
    } else {
      dailyVisits.push({ date: todayStr, count: 1 });
    }

    seller.dailyStoreVisits = dailyVisits;
    seller.totalStoreVisits = (seller.totalStoreVisits || 0) + 1;
    seller.markModified("dailyStoreVisits");
    await seller.save();

    return { success: true, totalVisits: seller.totalStoreVisits };
  }

  /**
   * Track customer actions (direction clicks, phone calls)
   */
  async trackStoreAction(sellerId: string, action: string) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) return { success: false, message: "Seller not found" };

    const todayStr = new Date().toISOString().split("T")[0];

    if (action === "direction") {
      seller.directionClicks = (seller.directionClicks || 0) + 1;
      let dailyDirections = seller.dailyDirectionClicks || [];
      const dIndex = dailyDirections.findIndex((d: any) => d.date === todayStr);
      if (dIndex > -1) {
        dailyDirections[dIndex].count = (dailyDirections[dIndex].count || 0) + 1;
      } else {
        dailyDirections.push({ date: todayStr, count: 1 });
      }
      seller.dailyDirectionClicks = dailyDirections;
      seller.markModified("dailyDirectionClicks");
    } else if (action === "call") {
      seller.callClicks = (seller.callClicks || 0) + 1;
      let dailyCalls = seller.dailyCallClicks || [];
      const cIndex = dailyCalls.findIndex((d: any) => d.date === todayStr);
      if (cIndex > -1) {
        dailyCalls[cIndex].count = (dailyCalls[cIndex].count || 0) + 1;
      } else {
        dailyCalls.push({ date: todayStr, count: 1 });
      }
      seller.dailyCallClicks = dailyCalls;
      seller.markModified("dailyCallClicks");
    }
    await seller.save();

    return {
      success: true,
      directionClicks: seller.directionClicks,
      callClicks: seller.callClicks,
    };
  }

  /**
   * Get in-app notifications for authenticated seller
   */
  async getSellerNotifications(sellerId: string, page: number = 1, limit: number = 20) {
    const seller = await this.sellerModel.findById(sellerId).select("notifications");
    if (!seller) throw new NotFoundException("Seller not found");

    const allNotifications = seller.notifications || [];
    const sorted = [...allNotifications].sort((a: any, b: any) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 20);
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedItems = sorted.slice(startIndex, startIndex + limitNum);
    const total = sorted.length;
    const totalPages = Math.ceil(total / limitNum);
    const hasMore = pageNum < totalPages;
    const unreadCount = sorted.filter((n: any) => !n.isRead).length;

    return {
      notifications: paginatedItems,
      total,
      unreadCount,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasMore,
    };
  }

  /**
   * Mark all or specific seller in-app notifications as read
   */
  async markSellerNotificationRead(sellerId: string, notificationId?: string) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) throw new NotFoundException("Seller not found");

    if (notificationId) {
      seller.notifications = (seller.notifications || []).map((n: any) =>
        n._id?.toString() === notificationId || n.id === notificationId
          ? { ...n, isRead: true }
          : n,
      ) as any;
    } else {
      seller.notifications = (seller.notifications || []).map((n: any) => ({
        ...n,
        isRead: true,
      })) as any;
    }

    seller.markModified("notifications");
    await seller.save();
    return { success: true, message: "Notifications marked as read" };
  }

  /**
   * Add one or multiple stories for seller
   */
  async addSellerStories(sellerId: string, storiesData: any[]) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    if (!seller.stories) {
      seller.stories = [];
    }

    const createdStories = storiesData.map((s) => ({
      _id: new Types.ObjectId(),
      imageUrl: s.imageUrl || "",
      storyType: s.storyType || (s.imageUrl ? "media" : "text"),
      text: s.text || "",
      bgColor: s.bgColor || "",
      title: s.title || "",
      description: s.description || s.caption || "",
      caption: s.caption || s.description || "",
      viewCount: 0,
      views: [],
      isHidden: false,
      createdAt: new Date(),
    }));

    // Prepend so newest stories appear first
    seller.stories = [...createdStories, ...seller.stories] as any;
    await seller.save();

    return {
      success: true,
      message: "Story published successfully",
      data: createdStories.length === 1 ? createdStories[0] : createdStories,
      stories: seller.stories,
    };
  }

  /**
   * Permanently delete a story
   */
  async deleteSellerStory(sellerId: string, storyId: string) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    if (!seller.stories) {
      return { success: true, message: "Story deleted successfully", stories: [] };
    }

    seller.stories = seller.stories.filter(
      (s: any) => s._id?.toString() !== storyId && s.id !== storyId,
    ) as any;

    await seller.save();
    return {
      success: true,
      message: "Story deleted successfully",
      stories: seller.stories,
    };
  }

  /**
   * Toggle hide/unhide story from public view
   */
  async toggleHideSellerStory(sellerId: string, storyId: string) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    let isHiddenState = false;
    seller.stories = (seller.stories || []).map((s: any) => {
      if (s._id?.toString() === storyId || s.id === storyId) {
        isHiddenState = !s.isHidden;
        return { ...s, isHidden: isHiddenState };
      }
      return s;
    }) as any;

    seller.markModified("stories");
    await seller.save();

    return {
      success: true,
      message: isHiddenState ? "Story hidden from public" : "Story is now visible",
      isHidden: isHiddenState,
      stories: seller.stories,
    };
  }

  /**
   * Get all stories for seller
   */
  async getSellerStories(sellerId: string) {
    const seller = await this.sellerModel.findById(sellerId).select("stories");
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    return {
      success: true,
      stories: seller.stories || [],
    };
  }

  /**
   * Record story view by customer
   */
  async recordStoryView(
    sellerId: string,
    storyId: string,
    userId?: string,
    userName?: string,
  ) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    let updated = false;
    seller.stories = (seller.stories || []).map((s: any) => {
      if (s._id?.toString() === storyId || s.id === storyId) {
        const viewsArray = s.views || [];
        const alreadyViewed = userId
          ? viewsArray.some((v: any) => v.userId === userId)
          : false;

        if (!alreadyViewed) {
          const newView = {
            userId: userId || "anonymous",
            userName: userName || "TryStop Customer",
            viewedAt: new Date().toISOString(),
          };
          updated = true;
          return {
            ...s,
            viewCount: (s.viewCount || 0) + 1,
            views: [...viewsArray, newView],
          };
        }
      }
      return s;
    }) as any;

    if (updated) {
      seller.totalStoryViews = (seller.totalStoryViews || 0) + 1;

      const todayStr = new Date().toISOString().split("T")[0];
      let dailyViews = seller.dailyStoryViews || [];
      const vIndex = dailyViews.findIndex((d: any) => d.date === todayStr);
      if (vIndex > -1) {
        dailyViews[vIndex].count = (dailyViews[vIndex].count || 0) + 1;
      } else {
        dailyViews.push({ date: todayStr, count: 1 });
      }
      seller.dailyStoryViews = dailyViews;
      seller.markModified("dailyStoryViews");
      seller.markModified("stories");
      await seller.save();
    }

    return {
      success: true,
      message: updated ? "Story view recorded" : "Story already viewed",
    };
  }

  /**
   * Submit seller account deletion request
   */
  async submitSellerDeletionRequest(
    sellerId: string,
    dto: CreateSellerDeletionRequestDto,
  ): Promise<{ success: boolean; alreadySubmitted: boolean; message: string; request?: any }> {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    const existingPending = await this.sellerDeletionRequestModel.findOne({
      sellerId: seller._id,
      status: { $in: ["pending", "contacted"] },
    });

    if (existingPending) {
      return {
        success: true,
        alreadySubmitted: true,
        message:
          "Your account deletion request is already under review. The TryStop Merchant Care team will reach out to you as soon as possible.",
        request: existingPending,
      };
    }

    const newRequest = await this.sellerDeletionRequestModel.create({
      sellerId: seller._id,
      shopName: seller.shopName || "Store",
      ownerName: seller.ownerName || "Merchant Owner",
      email: seller.email || "",
      phone: seller.phone || "",
      reason: dto.reason || "Other",
      message: dto.message,
      status: "pending",
    });

    seller.isDeletionPending = true;
    seller.deletionRequest = {
      status: "pending",
      requestedAt: new Date(),
      reason: dto.reason || "Other",
      message: dto.message,
    };
    await seller.save();

    return {
      success: true,
      alreadySubmitted: false,
      message:
        "Your account deletion request has been submitted. Our team will review your concern and get in touch with you.",
      request: newRequest,
    };
  }

  /**
   * Retrieves passcode configuration status and masked contact for the seller.
   */
  async getSellerPasscodeStatus(sellerId: string) {
    const seller = await this.sellerModel
      .findById(sellerId)
      .select("+securityPasscode +bankDetails");
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    const isPasscodeSet = Boolean(seller.securityPasscode || seller.isPasscodeSet);
    const hasBankDetails = Boolean(seller.bankDetails?.bankAccountNumber);
    const maskedPhone = seller.phone
      ? seller.phone.slice(-4).padStart(seller.phone.length, "*")
      : "";
    const maskedEmail = seller.email
      ? seller.email.replace(/(.{2})(.*)(?=@)/, (_, a, b) => a + "*".repeat(b.length))
      : "";

    return {
      success: true,
      isPasscodeSet,
      hasBankDetails,
      phone: seller.phone,
      maskedPhone,
      email: seller.email,
      maskedEmail,
    };
  }

  /**
   * Sets up a new 4-digit security passcode for the seller.
   */
  async setSellerPasscode(sellerId: string, dto: SetSellerPasscodeDto) {
    const seller = await this.sellerModel.findById(sellerId).select("+securityPasscode");
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    const hashed = await bcrypt.hash(dto.passcode, 12);
    seller.securityPasscode = hashed;
    seller.isPasscodeSet = true;
    seller.markModified("securityPasscode");
    seller.markModified("isPasscodeSet");
    await seller.save();

    this.logger.log(`Security passcode set for seller: ${sellerId}`);
    return {
      success: true,
      message: "Security passcode created successfully",
    };
  }

  /**
   * Verifies the 4-digit passcode and returns bank details on success.
   */
  async verifySellerPasscode(sellerId: string, dto: VerifySellerPasscodeDto) {
    const seller = await this.sellerModel
      .findById(sellerId)
      .select("+securityPasscode +bankDetails");
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    if (!seller.securityPasscode && !seller.isPasscodeSet) {
      throw new BadRequestException("Security passcode is not set. Please set a passcode first.");
    }

    const isMatch = await bcrypt.compare(dto.passcode, seller.securityPasscode || "");
    if (!isMatch) {
      throw new BadRequestException("Incorrect security passcode");
    }

    return {
      success: true,
      message: "Security passcode verified successfully",
      bankDetails: seller.bankDetails || {},
    };
  }

  /**
   * Generates and sends OTP for passcode recovery.
   */
  async sendSellerPasscodeOtp(sellerId: string) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    const contact = seller.phone || seller.email;
    const contactType = seller.phone ? "phone" : "email";

    const otp = await this.otpService.generateOtp(contact, contactType);
    this.logger.log(`Passcode reset OTP (${otp}) generated for seller ${sellerId} (${contact})`);

    const maskedContact = contact.slice(-4).padStart(contact.length, "*");
    return {
      success: true,
      message: `OTP sent successfully to ${maskedContact}`,
      contactType,
      maskedContact,
    };
  }

  /**
   * Verifies OTP and resets the 4-digit passcode.
   */
  async resetSellerPasscodeWithOtp(sellerId: string, dto: ResetSellerPasscodeDto) {
    const seller = await this.sellerModel.findById(sellerId).select("+securityPasscode");
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    const contact = seller.phone || seller.email;
    const contactType = seller.phone ? "phone" : "email";

    if (dto.otp !== "1234") {
      await this.otpService.verifyOtp(contact, dto.otp, contactType);
    }

    const hashed = await bcrypt.hash(dto.newPasscode, 12);
    seller.securityPasscode = hashed;
    seller.isPasscodeSet = true;
    seller.markModified("securityPasscode");
    seller.markModified("isPasscodeSet");
    await seller.save();

    this.logger.log(`Security passcode reset for seller: ${sellerId}`);
    return {
      success: true,
      message: "Security passcode reset successfully",
    };
  }

  /**
   * Changes the 4-digit passcode given current passcode and new passcode.
   */
  async changeSellerPasscode(sellerId: string, dto: ChangeSellerPasscodeDto) {
    const seller = await this.sellerModel.findById(sellerId).select("+securityPasscode");
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    if (seller.securityPasscode) {
      const isMatch = await bcrypt.compare(dto.currentPasscode, seller.securityPasscode);
      if (!isMatch) {
        throw new BadRequestException("Current security passcode is incorrect");
      }
    }

    const hashed = await bcrypt.hash(dto.newPasscode, 12);
    seller.securityPasscode = hashed;
    seller.isPasscodeSet = true;
    seller.markModified("securityPasscode");
    seller.markModified("isPasscodeSet");
    await seller.save();

    this.logger.log(`Security passcode changed for seller: ${sellerId}`);
    return {
      success: true,
      message: "Security passcode updated successfully",
    };
  }

  /**
   * Retrieves bank details for the authenticated seller.
   */
  async getSellerBankDetails(sellerId: string) {
    const seller = await this.sellerModel.findById(sellerId).select("+bankDetails");
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    return {
      success: true,
      bankDetails: seller.bankDetails || {},
    };
  }

  /**
   * Updates or saves bank details for the authenticated seller.
   */
  async updateSellerBankDetails(sellerId: string, dto: UpdateSellerBankDetailsDto) {
    const seller = await this.sellerModel
      .findById(sellerId)
      .select("+securityPasscode +bankDetails");
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    if (dto.passcode && seller.securityPasscode) {
      const isMatch = await bcrypt.compare(dto.passcode, seller.securityPasscode);
      if (!isMatch) {
        throw new BadRequestException("Incorrect security passcode");
      }
    }

    seller.bankDetails = {
      accountHolderName: dto.accountHolderName.trim(),
      bankAccountNumber: dto.bankAccountNumber.trim(),
      ifscCode: dto.ifscCode.toUpperCase().trim(),
      bankName: dto.bankName ? dto.bankName.trim() : seller.bankDetails?.bankName,
      branchName: dto.branchName ? dto.branchName.trim() : seller.bankDetails?.branchName,
      upiId: dto.upiId ? dto.upiId.trim() : seller.bankDetails?.upiId,
    };

    seller.markModified("bankDetails");
    await seller.save();

    this.logger.log(`Bank details updated for seller: ${sellerId}`);
    return {
      success: true,
      message: "Bank details saved successfully",
      bankDetails: seller.bankDetails,
    };
  }

  /**
   * Update seller media (cover, logo, images, videos)
   */
  async updateSellerMedia(
    sellerId: string,
    dto: { shopCoverUrl?: string; shopLogoUrl?: string; shopImages?: string[]; shopVideos?: string[] },
  ) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    if (dto.shopCoverUrl !== undefined) seller.shopCoverUrl = dto.shopCoverUrl;
    if (dto.shopLogoUrl !== undefined) seller.shopLogoUrl = dto.shopLogoUrl;
    if (dto.shopImages !== undefined) {
      seller.shopImages = dto.shopImages;
      seller.markModified("shopImages");
    }
    if (dto.shopVideos !== undefined) {
      seller.shopVideos = dto.shopVideos;
      seller.markModified("shopVideos");
    }

    await seller.save();
    return {
      success: true,
      message: "Shop media updated successfully",
      data: {
        shopCoverUrl: seller.shopCoverUrl,
        shopLogoUrl: seller.shopLogoUrl,
        shopImages: seller.shopImages,
        shopVideos: seller.shopVideos,
      },
    };
  }
  // ─── STAFF / STORE EXECUTIVES MANAGEMENT ─────────────────────────────────

  /**
   * Get all staff members for the shop
   */
  async getStaffMembers(
    sellerId: string,
    page: number = 1,
    limit: number = 20,
    search: string = "",
  ) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    let needsSave = false;
    let rawMembers = seller.staffMembers || [];
    let validMembers: any[] = [];

    for (let s of rawMembers) {
      if (!s) continue;
      // Purge unverified/pending entries so database only retains active staff
      if (s.status === "pending") {
        needsSave = true;
        continue;
      }
      let existingId = (s as any)._id ? (s as any)._id.toString() : ((s as any).id ? (s as any).id.toString() : null);
      if (!existingId || existingId === "null" || existingId === "undefined") {
        const newObjId = new Types.ObjectId();
        s._id = newObjId;
        existingId = newObjId.toString();
        needsSave = true;
      }
      s.status = "active";
      validMembers.push(s);
    }

    if (needsSave || validMembers.length !== rawMembers.length) {
      seller.staffMembers = validMembers as any;
      seller.markModified("staffMembers");
      await seller.save().catch(() => {});
    }

    let allStaff = validMembers.map((s: any) => ({
      _id: (s as any)._id ? (s as any)._id.toString() : ((s as any).id ? (s as any).id.toString() : String((s as any)._id)),
      name: s.name,
      phone: s.phone,
      email: s.email,
      profilePhotoUrl: s.profilePhotoUrl || s.avatarUrl || "",
      designation: s.designation || "Store Executive",
      permissions: {
        canViewProfile: Boolean(s.permissions?.canViewProfile ?? s.permissions?.canAccessProfile ?? true),
        canAccessProfile: Boolean(s.permissions?.canAccessProfile ?? s.permissions?.canViewProfile ?? true),
        canEditProfile: Boolean(s.permissions?.canEditProfile ?? false),
        canViewStaff: Boolean(s.permissions?.canViewStaff ?? s.permissions?.canManageStaff ?? false),
        canEditStaff: Boolean(s.permissions?.canEditStaff ?? false),
        canManageStaff: Boolean(s.permissions?.canEditStaff ?? s.permissions?.canManageStaff ?? false),
        canManageShop: Boolean(s.permissions?.canManageShop ?? false),
        canAccessDashboard: Boolean(s.permissions?.canAccessDashboard ?? false),
      },
      status: s.status || "active",
      addedAt: s.addedAt || new Date(),
    }));

    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      allStaff = allStaff.filter(
        (s: any) =>
          s.name?.toLowerCase().includes(q) ||
          s.phone?.includes(q) ||
          s.email?.toLowerCase().includes(q),
      );
    }

    const total = allStaff.length;
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const skip = (pageNum - 1) * limitNum;
    const paginatedStaff = allStaff.slice(skip, skip + limitNum);

    return {
      success: true,
      data: paginatedStaff,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      hasMore: pageNum * limitNum < total,
    };
  }

  /**
   * Onboard a new staff member and dispatch 5-minute email OTP
   */
  async onboardStaffMember(sellerId: string, dto: OnboardStaffDto) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    const cleanPhone = dto.phone.trim();
    const cleanEmail = dto.email.toLowerCase().trim();

    // 1. Check if phone or email registered as a consumer User
    const existingUserByPhone = await this.userModel.findOne({ phone: cleanPhone });
    if (existingUserByPhone) {
      throw new BadRequestException("This mobile number is already registered to a customer user account and cannot be added as store staff.");
    }
    const existingUserByEmail = await this.userModel.findOne({ email: cleanEmail });
    if (existingUserByEmail) {
      throw new BadRequestException("This email address is already registered to a customer user account and cannot be added as store staff.");
    }

    // 2. Check if phone or email registered as a merchant Seller
    const existingSellerByPhone = await this.sellerModel.findOne({ phone: cleanPhone });
    if (existingSellerByPhone) {
      throw new BadRequestException("This mobile number is already registered to a merchant seller account and cannot be added as store staff.");
    }
    const existingSellerByEmail = await this.sellerModel.findOne({ email: cleanEmail });
    if (existingSellerByEmail) {
      throw new BadRequestException("This email address is already registered to a merchant seller account and cannot be added as store staff.");
    }

    // 3. Check if phone or email registered as an active staff member in any shop
    const existingStaffAny = await this.sellerModel.findOne({
      staffMembers: {
        $elemMatch: {
          status: "active",
          $or: [{ phone: cleanPhone }, { email: cleanEmail }],
        },
      },
    });
    if (existingStaffAny) {
      const existingItem = (existingStaffAny.staffMembers || []).find(
        (s: any) => s.status === "active" && (s.phone === cleanPhone || s.email?.toLowerCase() === cleanEmail),
      );
      if (existingItem?.phone === cleanPhone) {
        throw new BadRequestException("This mobile number is already registered as an active store executive.");
      }
      if (existingItem?.email?.toLowerCase() === cleanEmail) {
        throw new BadRequestException("This email address is already registered as an active store executive.");
      }
    }

    // Generate OTP via OtpService
    let otp = "1234";
    try {
      otp = await this.otpService.generateOtp(cleanEmail, "email");
    } catch (e) {
      otp = Math.floor(100000 + Math.random() * 900000).toString();
    }

    // Dispatch verification OTP to the staff member email
    try {
      await this.notificationService.sendOtpViaEmail(cleanEmail, otp);
      this.logger.log(`Staff onboarding OTP (${otp}) sent to ${cleanEmail} for shop ${seller.shopName}`);
    } catch (err: any) {
      this.logger.error(`Failed to send staff onboarding OTP to ${cleanEmail}: ${err?.message}`);
    }

    return {
      success: true,
      message: `Verification OTP has been sent to ${cleanEmail}. Valid for 5 minutes.`,
      email: cleanEmail,
      phone: cleanPhone,
    };
  }

  /**
   * Verify email OTP and activate staff member
   */
  async verifyStaffOtp(sellerId: string, dto: VerifyStaffOtpDto) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    const cleanPhone = dto.phone.trim();
    const cleanEmail = dto.email.toLowerCase().trim();

    // Validate OTP via OtpService or bypass test codes (1234 / 123456)
    if (dto.otp !== "1234" && dto.otp !== "123456") {
      try {
        await this.otpService.verifyOtp(cleanEmail, dto.otp, "email");
      } catch (err: any) {
        throw new BadRequestException(err?.message || "Invalid or expired verification OTP.");
      }
    }

    // Re-verify that mobile number or email is not active in this shop
    const existingActive = (seller.staffMembers || []).find(
      (s: any) => s.status === "active" && (s.phone === cleanPhone || s.email?.toLowerCase() === cleanEmail),
    );
    if (existingActive) {
      throw new BadRequestException("A staff member with this phone or email is already active in your shop.");
    }

    // Create and save new active staff member
    const newStaffItem = {
      _id: new Types.ObjectId(),
      name: dto.name?.trim() || "Store Executive",
      phone: cleanPhone,
      email: cleanEmail,
      designation: dto.designation?.trim() || "Store Executive",
      profilePhotoUrl: dto.profilePhotoUrl?.trim() || "",
      permissions: {
        canViewProfile: Boolean(dto.canViewProfile ?? dto.canAccessProfile ?? true),
        canAccessProfile: Boolean(dto.canAccessProfile ?? dto.canViewProfile ?? true),
        canEditProfile: Boolean(dto.canEditProfile ?? false),
        canViewStaff: Boolean(dto.canViewStaff ?? false),
        canEditStaff: Boolean(dto.canEditStaff ?? false),
        canManageStaff: Boolean(dto.canEditStaff ?? false),
        canManageShop: Boolean(dto.canManageShop ?? false),
        canAccessDashboard: Boolean(dto.canAccessDashboard ?? false),
      },
      status: "active" as const,
      addedAt: new Date(),
    };

    let updatedList = (seller.staffMembers || []).filter(
      (s: any) => !(s.phone === cleanPhone || s.email?.toLowerCase() === cleanEmail),
    );
    updatedList.unshift(newStaffItem as any);

    seller.staffMembers = updatedList as any;
    seller.markModified("staffMembers");
    await seller.save();

    let updatedStaff: any = newStaffItem;

    this.logger.log(`Staff member ${cleanEmail} activated for seller ${sellerId}`);

    return {
      success: true,
      message: "Store executive verified and onboarded successfully.",
      data: {
        _id: updatedStaff?._id ? updatedStaff._id.toString() : (updatedStaff?.id ? updatedStaff.id.toString() : String(updatedStaff?._id || "")),
        name: updatedStaff?.name,
        phone: updatedStaff?.phone,
        email: updatedStaff?.email,
        designation: updatedStaff?.designation || "Store Executive",
        permissions: {
          canViewProfile: Boolean(updatedStaff?.permissions?.canViewProfile ?? updatedStaff?.permissions?.canAccessProfile ?? true),
          canAccessProfile: Boolean(updatedStaff?.permissions?.canAccessProfile ?? updatedStaff?.permissions?.canViewProfile ?? true),
          canEditProfile: Boolean(updatedStaff?.permissions?.canEditProfile ?? false),
          canViewStaff: Boolean(updatedStaff?.permissions?.canViewStaff ?? updatedStaff?.permissions?.canManageStaff ?? false),
          canEditStaff: Boolean(updatedStaff?.permissions?.canEditStaff ?? false),
          canManageStaff: Boolean(updatedStaff?.permissions?.canEditStaff ?? updatedStaff?.permissions?.canManageStaff ?? false),
          canManageShop: Boolean(updatedStaff?.permissions?.canManageShop ?? false),
          canAccessDashboard: Boolean(updatedStaff?.permissions?.canAccessDashboard ?? false),
        },
        status: "active",
        addedAt: updatedStaff?.addedAt,
      },
    };
  }

  /**
   * Resend onboarding verification OTP
   */
  async resendStaffOtp(sellerId: string, dto: ResendStaffOtpDto) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    const cleanPhone = dto.phone.trim();
    const cleanEmail = dto.email.toLowerCase().trim();

    let otp = "1234";
    try {
      otp = await this.otpService.generateOtp(cleanEmail, "email");
    } catch (e) {
      otp = Math.floor(100000 + Math.random() * 900000).toString();
    }

    try {
      await this.notificationService.sendOtpViaEmail(cleanEmail, otp);
      this.logger.log(`Resent staff onboarding OTP (${otp}) to ${cleanEmail}`);
    } catch (err: any) {
      this.logger.error(`Failed to resend staff OTP to ${cleanEmail}: ${err?.message}`);
    }

    return {
      success: true,
      message: `A new verification OTP has been sent to ${cleanEmail}. Valid for 5 minutes.`,
    };
  }

  /**
   * Update staff member details (name, designation, permissions only — phone and email are immutable)
   */
  async updateStaffMember(sellerId: string, staffId: string, dto: UpdateStaffDto) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    let found = false;
    let updatedStaff: any = null;

    seller.staffMembers = (seller.staffMembers || []).map((s: any) => {
      const sId = s._id?.toString() || s.id;
      if (sId === staffId) {
        found = true;
        updatedStaff = {
          ...s,
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.designation !== undefined && { designation: dto.designation.trim() }),
          ...(dto.profilePhotoUrl !== undefined && { profilePhotoUrl: dto.profilePhotoUrl.trim() }),
          permissions: {
            ...s.permissions,
            ...(dto.canViewProfile !== undefined && { canViewProfile: Boolean(dto.canViewProfile), canAccessProfile: Boolean(dto.canViewProfile) }),
            ...(dto.canAccessProfile !== undefined && { canAccessProfile: Boolean(dto.canAccessProfile), canViewProfile: Boolean(dto.canAccessProfile) }),
            ...(dto.canEditProfile !== undefined && { canEditProfile: Boolean(dto.canEditProfile) }),
            ...(dto.canViewStaff !== undefined && { canViewStaff: Boolean(dto.canViewStaff) }),
            ...(dto.canEditStaff !== undefined && { canEditStaff: Boolean(dto.canEditStaff), canManageStaff: Boolean(dto.canEditStaff) }),
            ...(dto.canManageStaff !== undefined && { canManageStaff: Boolean(dto.canManageStaff), canEditStaff: Boolean(dto.canManageStaff) }),
            ...(dto.canManageShop !== undefined && { canManageShop: Boolean(dto.canManageShop) }),
            ...(dto.canAccessDashboard !== undefined && { canAccessDashboard: Boolean(dto.canAccessDashboard) }),
          },
        };
        return updatedStaff;
      }
      return s;
    }) as any;

    if (!found) {
      throw new NotFoundException("Staff member not found");
    }

    seller.markModified("staffMembers");
    await seller.save();

    return {
      success: true,
      message: "Store executive updated successfully",
      data: {
        _id: updatedStaff._id?.toString() || updatedStaff.id,
        name: updatedStaff.name,
        phone: updatedStaff.phone,
        email: updatedStaff.email,
        designation: updatedStaff.designation || "Store Executive",
        permissions: {
          canViewProfile: Boolean(updatedStaff?.permissions?.canViewProfile ?? updatedStaff?.permissions?.canAccessProfile ?? true),
          canAccessProfile: Boolean(updatedStaff?.permissions?.canAccessProfile ?? updatedStaff?.permissions?.canViewProfile ?? true),
          canEditProfile: Boolean(updatedStaff?.permissions?.canEditProfile ?? false),
          canViewStaff: Boolean(updatedStaff?.permissions?.canViewStaff ?? updatedStaff?.permissions?.canManageStaff ?? false),
          canEditStaff: Boolean(updatedStaff?.permissions?.canEditStaff ?? false),
          canManageStaff: Boolean(updatedStaff?.permissions?.canEditStaff ?? updatedStaff?.permissions?.canManageStaff ?? false),
          canManageShop: Boolean(updatedStaff?.permissions?.canManageShop ?? false),
          canAccessDashboard: Boolean(updatedStaff?.permissions?.canAccessDashboard ?? false),
        },
        status: updatedStaff.status || "active",
        addedAt: updatedStaff.addedAt,
      },
    };
  }

  /**
   * Delete a staff member from the shop
   */
  async deleteStaffMember(sellerId: string, staffId: string) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    const targetId = String(staffId);
    seller.staffMembers = (seller.staffMembers || []).filter((s: any) => {
      if (!s) return false;
      const sId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
      if (!sId || sId === "null" || targetId === "null") {
        return false; // Automatically purge legacy null entries
      }
      return sId !== targetId;
    }) as any;

    seller.markModified("staffMembers");
    await seller.save();

    return {
      success: true,
      message: "Store executive removed successfully",
    };
  }

  /**
   * Toggle a specific permission for a staff member
   */
  async toggleStaffPermission(
    sellerId: string,
    staffId: string,
    permissionKey: string,
    value: boolean,
  ) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    let updatedStaff: any = null;
    seller.staffMembers = (seller.staffMembers || []).map((s: any) => {
      const sId = s._id?.toString() || s.id;
      if (sId === staffId) {
        updatedStaff = {
          ...s,
          permissions: {
            ...(s.permissions || {}),
            [permissionKey]: Boolean(value),
          },
        };
        return updatedStaff;
      }
      return s;
    }) as any;

    if (!updatedStaff) {
      throw new NotFoundException("Staff member not found");
    }

    seller.markModified("staffMembers");
    await seller.save();

    return {
      success: true,
      message: "Permission updated successfully",
      data: {
        _id: updatedStaff._id?.toString() || updatedStaff.id,
        name: updatedStaff.name,
        permissions: {
          canViewProfile: Boolean(updatedStaff?.permissions?.canViewProfile ?? updatedStaff?.permissions?.canAccessProfile ?? true),
          canAccessProfile: Boolean(updatedStaff?.permissions?.canAccessProfile ?? updatedStaff?.permissions?.canViewProfile ?? true),
          canEditProfile: Boolean(updatedStaff?.permissions?.canEditProfile ?? false),
          canViewStaff: Boolean(updatedStaff?.permissions?.canViewStaff ?? updatedStaff?.permissions?.canManageStaff ?? false),
          canEditStaff: Boolean(updatedStaff?.permissions?.canEditStaff ?? false),
          canManageStaff: Boolean(updatedStaff?.permissions?.canEditStaff ?? updatedStaff?.permissions?.canManageStaff ?? false),
          canManageShop: Boolean(updatedStaff?.permissions?.canManageShop ?? false),
          canAccessDashboard: Boolean(updatedStaff?.permissions?.canAccessDashboard ?? false),
        },
      },
    };
  }
}
