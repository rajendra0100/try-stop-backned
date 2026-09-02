import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Admin, AdminDocument } from './schemas/admin.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { Seller, SellerDocument } from '../auth/schemas/seller.schema';
import { SellerDeletionRequest, SellerDeletionRequestDocument } from '../auth/schemas/seller-deletion-request.schema';
import { UpdateSellerDeletionRequestStatusDto } from '../auth/dto/seller-deletion-request.dto';
import { Role } from '../common/enums/role.enum';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CreateSubadminDto } from './dto/create-subadmin.dto';
import { UpdateSubadminDto } from './dto/update-subadmin.dto';
import { RegisterSellerDto } from '../auth/dto/register-seller.dto';
import { UpdateSellerAdminDto } from '../auth/dto/update-seller-admin.dto';
import { ADMIN_ERRORS, ADMIN_SUCCESS } from './admin-auth.constants';

// ─── Response shape interfaces ──────────────────────────────────────────────


export interface SellerListItem {
  _id: string;
  shopName: string;
  ownerName: string;
  email?: string;
  phone?: string;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  shopCategory?: string;
  profilePhotoUrl?: string;
  createdAt: string;
}

export interface PaginatedSellersResponse {
  sellers: SellerListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SellerStatsResponse {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
}

/**
 * AdminAuthService — handles admin and subadmin authentication.
 * Completely separate from public auth flows.
 * No OTP. No public self-registration.
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @InjectModel(Admin.name) private readonly adminModel: Model<AdminDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Seller.name) private readonly sellerModel: Model<SellerDocument>,
    @InjectModel(SellerDeletionRequest.name) private readonly sellerDeletionRequestModel: Model<SellerDeletionRequestDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Admin / Subadmin login — email + password only.
   */
  async login(dto: AdminLoginDto): Promise<object> {
    const email = dto.email.toLowerCase().trim();

    const admin = await this.adminModel.findOne({ email }).select('+password');
    if (!admin || !admin.password) {
      throw new UnauthorizedException(ADMIN_ERRORS.INVALID_CREDENTIALS);
    }

    if (dto.role && admin.role !== dto.role) {
      throw new UnauthorizedException(ADMIN_ERRORS.ROLE_MISMATCH(dto.role));
    }

    const isValid = await bcrypt.compare(dto.password, admin.password);
    if (!isValid) {
      throw new UnauthorizedException(ADMIN_ERRORS.INVALID_CREDENTIALS);
    }

    this.logger.log(`Admin login: ${email} (${admin.role})`);

    const payload = { sub: admin._id, role: admin.role };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
      },
    };
  }

  /**
   * Create a superadmin (bootstrap only — requires secret) or subadmin (requires admin JWT).
   */
  async createSuperAdmin(password: string, name: string, email: string, secret: string): Promise<object> {
    const expectedSecret = this.configService.get<string>('FIRST_SUPERADMIN_SECRET');
    if (secret !== expectedSecret) {
      throw new ForbiddenException(ADMIN_ERRORS.INVALID_BOOTSTRAP_SECRET);
    }

    const exists = await this.adminModel.findOne({ email: email.toLowerCase() });
    if (exists) throw new ConflictException(ADMIN_ERRORS.EMAIL_REGISTERED);

    const hashed = await bcrypt.hash(password, 12);
    const admin = await this.adminModel.create({
      name,
      email: email.toLowerCase(),
      password: hashed,
      role: Role.SUPERADMIN,
    });

    const obj = admin.toObject() as unknown as Record<string, unknown>;
    delete obj.password;
    this.logger.log(`SuperAdmin created: ${email}`);
    return { message: ADMIN_SUCCESS.SUPERADMIN_CREATED, admin: obj };
  }

  /**
   * Create a subadmin — protected, only callable by an authenticated superadmin.
   */
  async createSubadmin(dto: CreateSubadminDto, currentAdmin: AdminDocument): Promise<object> {
    if (currentAdmin.role !== Role.SUPERADMIN) {
      throw new ForbiddenException(ADMIN_ERRORS.ONLY_SUPERADMIN_ALLOWED);
    }

    const email = dto.email.toLowerCase().trim();
    const exists = await this.adminModel.findOne({ email });
    if (exists) throw new ConflictException(ADMIN_ERRORS.EMAIL_REGISTERED);

    const hashed = await bcrypt.hash(dto.password, 12);
    const subadmin = await this.adminModel.create({
      name: dto.name,
      email,
      password: hashed,
      role: Role.SUBADMIN,
      permissions: dto.permissions ?? [],
      profilePhotoUrl: dto.profilePhotoUrl,
    });

    const obj = subadmin.toObject() as unknown as Record<string, unknown>;
    delete obj.password;
    this.logger.log(`Subadmin created: ${email} by ${currentAdmin.email}`);
    return { message: ADMIN_SUCCESS.SUBADMIN_CREATED, admin: obj };
  }

  /**
   * List all subadmins — protected, superadmin only.
   */
  async listSubadmins(): Promise<Admin[]> {
    return this.adminModel.find({ role: Role.SUBADMIN }).select('-password');
  }

  /**
   * Update subadmin details and permissions — protected, superadmin only.
   */
  async updateSubadmin(
    id: string,
    dto: UpdateSubadminDto,
    currentAdmin: AdminDocument,
  ): Promise<object> {
    if (currentAdmin.role !== Role.SUPERADMIN) {
      throw new ForbiddenException(ADMIN_ERRORS.ONLY_SUPERADMIN_ALLOWED);
    }

    const subadmin = await this.adminModel.findById(id);
    if (!subadmin || subadmin.role !== Role.SUBADMIN) {
      throw new ConflictException('Subadmin not found');
    }

    if (dto.email) {
      const email = dto.email.toLowerCase().trim();
      if (email !== subadmin.email) {
        const exists = await this.adminModel.findOne({ email });
        if (exists) throw new ConflictException(ADMIN_ERRORS.EMAIL_REGISTERED);
        subadmin.email = email;
      }
    }

    if (dto.name) {
      subadmin.name = dto.name;
    }

    if (dto.password) {
      subadmin.password = await bcrypt.hash(dto.password, 12);
    }

    if (dto.permissions) {
      subadmin.permissions = dto.permissions;
    }

    if (dto.profilePhotoUrl !== undefined) {
      subadmin.profilePhotoUrl = dto.profilePhotoUrl;
    }

    await subadmin.save();

    const obj = subadmin.toObject() as unknown as Record<string, unknown>;
    delete obj.password;
    this.logger.log(`Subadmin updated: ${subadmin.email} by ${currentAdmin.email}`);
    return { message: 'Subadmin updated successfully', admin: obj };
  }

  /**
   * Delete a subadmin — protected, superadmin only.
   */
  async deleteSubadmin(id: string, currentAdmin: AdminDocument): Promise<object> {
    if (currentAdmin.role !== Role.SUPERADMIN) {
      throw new ForbiddenException(ADMIN_ERRORS.ONLY_SUPERADMIN_ALLOWED);
    }

    const subadmin = await this.adminModel.findById(id);
    if (!subadmin || subadmin.role !== Role.SUBADMIN) {
      throw new ConflictException('Subadmin not found');
    }

    await this.adminModel.deleteOne({ _id: id });
    this.logger.log(`Subadmin deleted: ${subadmin.email} by ${currentAdmin.email}`);
    return { message: 'Subadmin deleted successfully' };
  }



  /**
   * List all registered sellers/shops with search, pagination, and status filters.
   */
  async listSellers(page = 1, limit = 10, search = '', status = ''): Promise<PaginatedSellersResponse> {
    const query: any = {};
    if (status && status !== 'all') {
      query.verificationStatus = status;
    }
    if (search) {
      query.$or = [
        { shopName: { $regex: search, $options: 'i' } },
        { ownerName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    const skip = (page - 1) * limit;
    const [sellers, total] = await Promise.all([
      this.sellerModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean<SellerListItem[]>(),
      this.sellerModel.countDocuments(query),
    ]);
    return { sellers, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get metrics and stats for registered sellers/shops.
   */

  /** List seller deletion requests with pagination, filters and counts */
  async getSellerDeletionRequests(
    page = 1,
    limit = 20,
    status = 'all',
    search?: string,
  ) {
    const filter: any = {};
    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { shopName: regex },
        { ownerName: regex },
        { email: regex },
        { phone: regex },
        { reason: regex },
        { message: regex },
      ];
    }

    const skip = (Math.max(1, page) - 1) * limit;
    const [requests, total, totalAll, pendingCount, contactedCount, resolvedCount, deletedCount] =
      await Promise.all([
        this.sellerDeletionRequestModel
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        this.sellerDeletionRequestModel.countDocuments(filter),
        this.sellerDeletionRequestModel.countDocuments(),
        this.sellerDeletionRequestModel.countDocuments({ status: 'pending' }),
        this.sellerDeletionRequestModel.countDocuments({ status: 'contacted' }),
        this.sellerDeletionRequestModel.countDocuments({ status: 'resolved' }),
        this.sellerDeletionRequestModel.countDocuments({ status: 'deleted' }),
      ]);

    return {
      requests,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit) || 1,
      stats: {
        total: totalAll,
        pending: pendingCount,
        contacted: contactedCount,
        resolved: resolvedCount,
        deleted: deletedCount,
      },
    };
  }

  /** Update deletion request status (e.g. contacted or resolved) */
  async updateSellerDeletionRequestStatus(
    id: string,
    dto: UpdateSellerDeletionRequestStatusDto,
  ) {
    const request = await this.sellerDeletionRequestModel.findById(id);
    if (!request) {
      throw new NotFoundException('Deletion request not found');
    }

    request.status = dto.status;
    if (dto.adminNotes !== undefined) {
      request.adminNotes = dto.adminNotes;
    }
    if (dto.status === 'resolved') {
      request.resolvedAt = new Date();
      // Reset seller pending state
      await this.sellerModel.findByIdAndUpdate(request.sellerId, {
        isDeletionPending: false,
        'deletionRequest.status': 'resolved',
      });
    }

    await request.save();
    return { message: 'Status updated successfully', request };
  }

  /** Permanently delete seller account based on deletion request */
  async executeSellerDeletion(requestId: string) {
    const request = await this.sellerDeletionRequestModel.findById(requestId);
    if (!request) {
      throw new NotFoundException('Deletion request not found');
    }

    const seller = await this.sellerModel.findById(request.sellerId);
    if (seller) {
      await this.sellerModel.deleteOne({ _id: seller._id });
    }

    request.status = 'deleted';
    request.deletedAt = new Date();
    await request.save();

    return { message: 'Seller account deleted successfully' };
  }

  async getSellerStats(): Promise<SellerStatsResponse> {
    const stats = await this.sellerModel.aggregate([
      {
        $group: {
          _id: '$verificationStatus',
          count: { $sum: 1 },
        },
      },
    ]);

    const result: SellerStatsResponse = {
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
    };

    stats.forEach((s) => {
      if (s._id === 'approved') result.approved = s.count;
      else if (s._id === 'pending') result.pending = s.count;
      else if (s._id === 'rejected') result.rejected = s.count;
      result.total += s.count;
    });

    return result;
  }

  /**
   * Onboard a seller directly from the admin panel (auto-approved).
   */
  async onboardSeller(dto: RegisterSellerDto) {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.sellerModel.findOne({ email });
    if (existing) {
      throw new ConflictException('Seller email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const seller = await this.sellerModel.create({
      shopName: dto.shopName,
      ownerName: dto.ownerName,
      email,
      password: hashedPassword,
      phone: dto.phone,
      alternatePhone: dto.alternatePhone ?? '',
      shopDescription: dto.shopDescription ?? '',
      openingHours: dto.openingHours ?? '10:00 AM - 09:30 PM (All 7 Days)',
      ...(dto.operatingHoursSchedule && { operatingHoursSchedule: dto.operatingHoursSchedule }),
      shopLogoUrl: dto.shopLogoUrl,
      shopCoverUrl: dto.shopCoverUrl,
      shopImages: dto.shopImages ?? [],
      shopVideos: dto.shopVideos ?? [],
      stories: dto.stories ?? [],
      categories: dto.categories ?? [],
      productTypes: dto.productTypes ?? [],
      minPrice: dto.minPrice ?? 0,
      maxPrice: dto.maxPrice ?? 0,
      ...(dto.shopFullAddress && {
        shopAddress: {
          fullAddress: dto.shopFullAddress,
          lat: dto.shopLat,
          lng: dto.shopLng,
        },
      }),
      ...(dto.gstNumber && {
        businessDocuments: {
          gstNumber: dto.gstNumber,
          gstCertificateUrl: dto.gstCertificateUrl,
          panNumber: dto.panNumber,
          panImageUrl: dto.panImageUrl,
        },
      }),
      ...(dto.bankAccountNumber && {
        bankDetails: {
          bankAccountNumber: dto.bankAccountNumber,
          ifscCode: dto.ifscCode,
          accountHolderName: dto.accountHolderName,
        },
      }),
      role: Role.SELLER,
      verificationStatus: 'approved', // Auto-approved when onboarded by admin
    });

    return seller;
  }

  /**
   * Update seller details, phone numbers, and operating hours schedule by Admin.
   */
  async updateSeller(id: string, dto: any) {
    const seller = await this.sellerModel.findById(id);
    if (!seller) {
      throw new NotFoundException('Seller not found');
    }

    if (dto.shopName !== undefined) seller.shopName = dto.shopName;
    if (dto.ownerName !== undefined) seller.ownerName = dto.ownerName;
    if (dto.phone !== undefined) seller.phone = dto.phone;
    if (dto.alternatePhone !== undefined) seller.alternatePhone = dto.alternatePhone;
    if (dto.shopDescription !== undefined) seller.shopDescription = dto.shopDescription;
    if (dto.openingHours !== undefined) seller.openingHours = dto.openingHours;
    if (dto.operatingHoursSchedule !== undefined) seller.operatingHoursSchedule = dto.operatingHoursSchedule;
    if (dto.isOpenNow !== undefined) seller.isOpenNow = dto.isOpenNow;
    if (dto.verificationStatus !== undefined) seller.verificationStatus = dto.verificationStatus;
    if (dto.shopAddress !== undefined) seller.shopAddress = { ...seller.shopAddress, ...dto.shopAddress };
    if (dto.categories !== undefined) seller.categories = dto.categories;
    if (dto.productTypes !== undefined) seller.productTypes = dto.productTypes;
    if (dto.minPrice !== undefined) seller.minPrice = dto.minPrice;
    if (dto.maxPrice !== undefined) seller.maxPrice = dto.maxPrice;

    await seller.save();
    return {
      message: 'Seller updated successfully',
      seller,
    };
  }

  /**
   * Update seller approval status (approved, rejected, pending).
   */
  async updateSellerStatus(
    sellerId: string,
    status: 'approved' | 'rejected' | 'pending',
  ) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) {
      throw new NotFoundException('Seller not found');
    }

    seller.verificationStatus = status;
    await seller.save();

    return {
      message: `Seller status updated to ${status}`,
      seller,
    };
  }

  /**
   * Update individual seller's commission rate & custom PG fee rate.
   */
  async updateSellerCommission(
    sellerId: string,
    commissionRate?: number,
    customPgFeeRate?: number,
  ) {
    const updateData: any = {};
    if (commissionRate !== undefined && commissionRate !== null) {
      if (commissionRate < 0 || commissionRate > 1) {
        throw new BadRequestException('Commission rate must be between 0 and 100%');
      }
      updateData.commissionRate = commissionRate;
    }
    if (customPgFeeRate !== undefined && customPgFeeRate !== null) {
      if (customPgFeeRate < 0 || customPgFeeRate > 1) {
        throw new BadRequestException('PG fee rate must be between 0 and 100%');
      }
      updateData.customPgFeeRate = customPgFeeRate;
    }

    const result = await this.sellerModel.findByIdAndUpdate(
      sellerId,
      updateData,
      { new: true },
    );
    if (!result) {
      throw new NotFoundException('Seller not found');
    }
    return {
      message: 'Seller rates updated successfully',
      seller: result,
    };
  }

  /**
   * Update seller promotional offers & discount percentage.
   */
  async updateSellerOffers(
    sellerId: string,
    offerTags: string[],
    discountPercent: number,
  ) {
    if (discountPercent < 0 || discountPercent > 100) {
      throw new BadRequestException('Discount percent must be between 0 and 100%');
    }
    const result = await this.sellerModel.findByIdAndUpdate(
      sellerId,
      { offerTags, discountPercent },
      { new: true },
    );
    if (!result) {
      throw new NotFoundException('Seller not found');
    }
    return {
      message: 'Seller promotional offers updated successfully',
      seller: result,
    };
  }

  /**
   * Admin updates a seller's complete details (address, docs, bank, media).
   */
  async updateSellerProfile(sellerId: string, dto: UpdateSellerAdminDto) {
    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) throw new NotFoundException('Seller not found');

    if (dto.email) {
      const email = dto.email.toLowerCase().trim();
      const existing = await this.sellerModel.findOne({
        email,
        _id: { $ne: sellerId },
      });
      if (existing) {
        throw new ConflictException('Email already in use by another seller');
      }
      seller.email = email;
    }

    if (dto.password) {
      seller.password = await bcrypt.hash(dto.password, 12);
    }

    if (dto.shopName !== undefined) seller.shopName = dto.shopName;
    if (dto.ownerName !== undefined) seller.ownerName = dto.ownerName;
    if (dto.phone !== undefined) seller.phone = dto.phone;
    if (dto.shopLogoUrl !== undefined) seller.shopLogoUrl = dto.shopLogoUrl;
    if (dto.categories !== undefined) seller.categories = dto.categories;
    if (dto.productTypes !== undefined) seller.productTypes = dto.productTypes;
    if (dto.minPrice !== undefined) seller.minPrice = Number(dto.minPrice);
    if (dto.maxPrice !== undefined) seller.maxPrice = Number(dto.maxPrice);
    if (dto.shopCoverUrl !== undefined) seller.shopCoverUrl = dto.shopCoverUrl;
    if (dto.shopImages !== undefined) seller.shopImages = dto.shopImages;
    if (dto.shopVideos !== undefined) seller.shopVideos = dto.shopVideos;
    if (dto.stories !== undefined) seller.stories = dto.stories as any;

    // Address & coordinates
    if (
      dto.shopFullAddress !== undefined ||
      dto.shopLat !== undefined ||
      dto.shopLng !== undefined
    ) {
      seller.shopAddress = {
        fullAddress:
          dto.shopFullAddress !== undefined
            ? dto.shopFullAddress
            : seller.shopAddress?.fullAddress || '',
        lat: dto.shopLat !== undefined ? dto.shopLat : seller.shopAddress?.lat,
        lng: dto.shopLng !== undefined ? dto.shopLng : seller.shopAddress?.lng,
      };
    }

    // Business documents
    if (
      dto.gstNumber !== undefined ||
      dto.gstCertificateUrl !== undefined ||
      dto.panNumber !== undefined ||
      dto.panImageUrl !== undefined
    ) {
      seller.businessDocuments = {
        gstNumber:
          dto.gstNumber !== undefined
            ? dto.gstNumber
            : seller.businessDocuments?.gstNumber,
        gstCertificateUrl:
          dto.gstCertificateUrl !== undefined
            ? dto.gstCertificateUrl
            : seller.businessDocuments?.gstCertificateUrl,
        panNumber:
          dto.panNumber !== undefined
            ? dto.panNumber
            : seller.businessDocuments?.panNumber,
        panImageUrl:
          dto.panImageUrl !== undefined
            ? dto.panImageUrl
            : seller.businessDocuments?.panImageUrl,
      };
    }

    // Bank details
    if (
      dto.bankAccountNumber !== undefined ||
      dto.ifscCode !== undefined ||
      dto.accountHolderName !== undefined ||
      dto.bankName !== undefined ||
      dto.branchName !== undefined ||
      dto.upiId !== undefined
    ) {
      seller.bankDetails = {
        bankAccountNumber:
          dto.bankAccountNumber !== undefined
            ? dto.bankAccountNumber
            : seller.bankDetails?.bankAccountNumber,
        ifscCode:
          dto.ifscCode !== undefined
            ? dto.ifscCode
            : seller.bankDetails?.ifscCode,
        accountHolderName:
          dto.accountHolderName !== undefined
            ? dto.accountHolderName
            : seller.bankDetails?.accountHolderName,
        bankName:
          dto.bankName !== undefined
            ? dto.bankName
            : seller.bankDetails?.bankName,
        branchName:
          dto.branchName !== undefined
            ? dto.branchName
            : seller.bankDetails?.branchName,
        upiId:
          dto.upiId !== undefined
            ? dto.upiId
            : seller.bankDetails?.upiId,
      };
    }

    const saved = await seller.save();
    return {
      message: 'Seller profile updated successfully',
      seller: saved,
    };
  }
}
