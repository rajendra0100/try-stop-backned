import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  Logger,
  NotImplementedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Client as GoogleMapsClient } from '@googlemaps/google-maps-services-js';

const googleMapsClient = new GoogleMapsClient({});

import { User, UserDocument } from './schemas/user.schema';
import { Seller, SellerDocument } from './schemas/seller.schema';
import { Transaction, TransactionDocument } from '../payment/schemas/transaction.schema';
import { Role } from '../common/enums/role.enum';
import { OtpService } from '../otp/otp.service';
import { NotificationService } from '../notification/notification.service';
import { FcmNotificationService } from '../fcm-notification/fcm-notification.service';

import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { RegisterSellerDto } from './dto/register-seller.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { LoginDto } from './dto/login.dto';
import { AUTH_ERRORS, AUTH_SUCCESS } from './auth.constants';

/** Simple email regex for detecting contact type */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface TokenPayload {
  sub: string;
  role: Role;
}

/**
 * AuthService — centralized logic for user and seller flows.
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │  USER   → OTP only. Auto-registers on first verify.         │
 * │  SELLER → Password. Registers with full business details.   │
 * │  ADMIN  → Handled by AdminAuthService (separate module).    │
 * └──────────────────────────────────────────────────────────────┘
 *
 * Shared helpers (sendOtp, verifyOtpAndLogin, buildTokenResponse)
 * are called from thin role-specific controllers — zero logic duplication.
 */
import { DeletedUser, DeletedUserDocument } from './schemas/deleted-user.schema';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Seller.name)
    private readonly sellerModel: Model<SellerDocument>,
    @InjectModel(DeletedUser.name)
    private readonly deletedUserModel: Model<DeletedUserDocument>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly otpService: OtpService,
    private readonly notificationService: NotificationService,
    private readonly fcmNotificationService: FcmNotificationService,
  ) {}

  // ─── USER FLOW ─────────────────────────────────────────────────────────────

  /** Optional pre-registration for users — saves name/contact before OTP */
  async registerUser(dto: RegisterUserDto): Promise<object> {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException(AUTH_ERRORS.PROVIDE_CONTACT);
    }

    const filter = dto.email ? { email: dto.email } : { phone: dto.phone };
    const existing = await this.userModel.findOne(filter);
    if (existing) {
      return { message: AUTH_ERRORS.ACCOUNT_EXISTS };
    }

    const user = await this.userModel.create({
      name: dto.name ?? (dto.email ? dto.email.split('@')[0] : 'User'),
      email: dto.email,
      phone: dto.phone,
      profilePhotoUrl: dto.profilePhotoUrl,
      role: Role.USER,
    });

    this.logger.log(`User pre-registered: ${dto.email ?? dto.phone}`);
    return { message: AUTH_SUCCESS.USER_PRE_REGISTERED, userId: user._id };
  }

  // ─── SELLER FLOW ───────────────────────────────────────────────────────────

  /** Full business registration for sellers */
  async registerSeller(dto: RegisterSellerDto): Promise<object> {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.sellerModel.findOne({ email });
    if (existing)
      throw new ConflictException(AUTH_ERRORS.SELLER_EMAIL_REGISTERED);

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
      subcategoryNames: dto.subcategoryNames ?? [],
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
          bankName: dto.bankName,
          branchName: dto.branchName,
          upiId: dto.upiId,
        },
      }),
    });

    const obj = seller.toObject() as unknown as Record<string, unknown>;
    delete obj.password;
    this.logger.log(`Seller registered: ${email}`);
    return {
      message: AUTH_SUCCESS.SELLER_REGISTERED,
      seller: obj,
    };
  }

  /** Password login for sellers (email or phone + password) */
  async sellerLogin(dto: LoginDto): Promise<object> {
    const identifier = dto.identifier.toLowerCase().trim();
    const seller = await this.sellerModel
      .findOne({ $or: [{ email: identifier }, { phone: identifier }] })
      .select('+password');

    if (!seller || !seller.password) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }

    const isValid = await bcrypt.compare(dto.password, seller.password);
    if (!isValid)
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);

    this.logger.log(`Seller login: ${identifier}`);
    return this.buildTokenResponse(seller._id.toString(), Role.SELLER, {
      role: Role.SELLER,
      shopName: seller.shopName,
      ownerName: seller.ownerName,
      email: seller.email,
      phone: seller.phone,
      shopLogoUrl: seller.shopLogoUrl,
      shopCoverUrl: seller.shopCoverUrl,
      shopBannerUrl: seller.shopBannerUrl,
      shopImages: seller.shopImages || [],
      verificationStatus: seller.verificationStatus,
    });
  }

  // ─── SHARED OTP HELPERS ───────────────────────────────────────────────────

  /**
   * Shared OTP sender — used by user login flow.
   * Detects email vs phone and routes to appropriate notification channel.
   */
  async sendOtp(
    dto: SendOtpDto,
    forRole?: 'user' | 'seller',
  ): Promise<{ message: string; role: 'user' | 'seller' }> {
    const identifier = dto.identifier.toLowerCase().trim();
    const isEmail = EMAIL_REGEX.test(identifier);
    const contactType = isEmail ? 'email' : 'phone';

    let detectedRole: 'user' | 'seller' = forRole || 'user';
    if (!forRole) {
      const seller = await this.sellerModel.findOne({
        $or: [
          isEmail ? { email: identifier } : { phone: identifier },
          { staffMembers: { $elemMatch: { phone: identifier, status: 'active' } } },
        ],
      });
      if (seller) {
        detectedRole = 'seller';
      }
    } else if (forRole === 'seller') {
      const seller = await this.sellerModel.findOne({
        $or: [
          isEmail ? { email: identifier } : { phone: identifier },
          { staffMembers: { $elemMatch: { phone: identifier, status: 'active' } } },
        ],
      });
      if (!seller) {
        throw new NotFoundException('No registered seller account found with this phone number');
      }
    }

    const otp = await this.otpService.generateOtp(identifier, contactType);

    if (isEmail) {
      await this.notificationService.sendOtpViaEmail(identifier, otp);
    } else {
      this.logger.log(
        `[SMS DUMMY] Sending OTP ${otp} via SMS to ${identifier}`,
      );
    }

    this.logger.log(
      `OTP generated for ${detectedRole} at ${contactType}: ${identifier}`,
    );
    return { message: AUTH_SUCCESS.OTP_SENT, role: detectedRole };
  }

  /**
   * Shared OTP verifier — used by user and seller login flows.
   * Looks up the correct collection based on forRole.
   * Auto-registers user if new, authenticates seller if existing.
   */
  async verifyOtpAndLogin(
    dto: VerifyOtpDto,
    forRole: 'user' | 'seller',
  ): Promise<object> {
    const identifier = dto.identifier.toLowerCase().trim();
    const isEmail = EMAIL_REGEX.test(identifier);
    const contactType = isEmail ? 'email' : 'phone';

    await this.otpService.verifyOtp(identifier, dto.otp, contactType);

    // Check if identifier belongs to a seller shop or an active staff member of a shop
    const seller = await this.sellerModel.findOne({
      $or: [
        isEmail ? { email: identifier } : { phone: identifier },
        { staffMembers: { $elemMatch: { phone: identifier, status: 'active' } } },
      ],
    });

    if (seller) {
      const isStaffLogin = !isEmail && seller.phone !== identifier;
      const staffMember = isStaffLogin
        ? (seller.staffMembers || []).find(
            (s: any) => s.phone === identifier && s.status === 'active',
          )
        : null;

      this.logger.log(
        isStaffLogin
          ? `Staff member OTP login: ${identifier} for shop ${seller.shopName}`
          : `Seller OTP login: ${identifier}`,
      );

      return this.buildTokenResponse(seller._id.toString(), Role.SELLER, {
        role: Role.SELLER,
        isStaff: Boolean(isStaffLogin),
        staffMember: staffMember
          ? {
              _id: (staffMember as any)._id?.toString() || (staffMember as any).id || (staffMember as any)._id,
              name: staffMember.name,
              phone: staffMember.phone,
              email: staffMember.email,
              designation: staffMember.designation || 'Store Executive',
              permissions: {
                canViewProfile: Boolean((staffMember.permissions as any)?.canViewProfile ?? (staffMember.permissions as any)?.canAccessProfile ?? true),
                canAccessProfile: Boolean((staffMember.permissions as any)?.canAccessProfile ?? (staffMember.permissions as any)?.canViewProfile ?? true),
                canEditProfile: Boolean((staffMember.permissions as any)?.canEditProfile ?? false),
                canViewStaff: Boolean((staffMember.permissions as any)?.canViewStaff ?? (staffMember.permissions as any)?.canManageStaff ?? false),
                canEditStaff: Boolean((staffMember.permissions as any)?.canEditStaff ?? false),
                canManageStaff: Boolean((staffMember.permissions as any)?.canEditStaff ?? (staffMember.permissions as any)?.canManageStaff ?? false),
                canViewShop: Boolean((staffMember.permissions as any)?.canViewShop ?? (staffMember.permissions as any)?.canManageProducts ?? false),
                canEditShop: Boolean((staffMember.permissions as any)?.canEditShop ?? false),
                canManageProducts: Boolean((staffMember.permissions as any)?.canEditShop ?? (staffMember.permissions as any)?.canManageProducts ?? false),
              },
            }
          : null,
        shopName: seller.shopName,
        ownerName: seller.ownerName,
        email: seller.email,
        phone: seller.phone,
        shopLogoUrl: seller.shopLogoUrl,
        shopCoverUrl: seller.shopCoverUrl,
        shopBannerUrl: seller.shopBannerUrl,
        shopImages: seller.shopImages || [],
        verificationStatus: seller.verificationStatus,
      });
    }

    if (forRole === 'seller') {
      throw new NotFoundException('No registered seller account found');
    }

    return this.handleUserLogin(identifier, isEmail);
  }

  // ─── SHARED / HELPERS ─────────────────────────────────────────────────────

  async refreshToken(
    token: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: TokenPayload;
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_REFRESH_TOKEN);
    }

    // Ensure the account still exists in the database before issuing new access token
    let exists = false;
    switch (payload.role) {
      case Role.USER:
        exists = !!(await this.userModel.exists({ _id: payload.sub }));
        break;
      case Role.SELLER:
        exists = !!(await this.sellerModel.exists({ _id: payload.sub }));
        break;
    }

    if (!exists) {
      throw new UnauthorizedException(AUTH_ERRORS.ACCOUNT_DELETED);
    }

    const newPayload = { sub: payload.sub, role: payload.role };

    const accessToken = this.jwtService.sign(newPayload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(newPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '365d',
    });

    return { accessToken, refreshToken };
  }

  // ─── LOGOUT & DELETE ACCOUNT ──────────────────────────────────────────────────

  async logoutUser(userId: string): Promise<{ message: string }> {
    this.logger.log(`User logged out: ${userId}`);
    return { message: 'Logged out successfully' };
  }

  async deleteAccount(userId: string): Promise<{ message: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Transfer and archive user data into DeletedUser schema
    await this.deletedUserModel.create({
      originalUserId: user._id.toString(),
      phone: user.phone,
      email: user.email,
      name: user.name,
      deletedAt: new Date(),
      reason: 'user_requested',
    });

    // Delete user from active users collection
    await this.userModel.deleteOne({ _id: user._id });
    this.logger.log(`User account deleted & archived: ${userId} (${user.phone || user.email})`);

    return { message: 'Account deleted successfully' };
  }


  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async handleUserLogin(
    identifier: string,
    isEmail: boolean,
  ): Promise<object> {
    const filter = isEmail ? { email: identifier } : { phone: identifier };
    let user = await this.userModel.findOne(filter);
    let isNewUser = false;

    if (!user) {
      // Check if user previously deleted their account for offer anti-abuse tracking
      const deletedUser = await this.deletedUserModel.findOne(filter);
      
      // When account was deleted, user starts with fresh profile setup experience (isNewUser: true)
      isNewUser = true;

      // Auto-register user on first OTP verify
      user = await this.userModel.create({
        [isEmail ? 'email' : 'phone']: identifier,
        role: Role.USER,
        isEmailVerified: isEmail,
        isPhoneVerified: !isEmail,
      });

      if (deletedUser) {
        this.logger.log(`Returning user re-registered after account deletion (profile setup required): ${identifier}`);
      } else {
        this.logger.log(`New user auto-registered: ${identifier}`);
      }
    } else {
      const update = isEmail
        ? { isEmailVerified: true }
        : { isPhoneVerified: true };
      await this.userModel.updateOne({ _id: user._id }, update);
    }

    return this.buildTokenResponse(user._id.toString(), Role.USER, {
      role: Role.USER,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isNewUser,
    });
  }

  async getProfile(userId: string) {
    let user: any = await this.userModel.findById(userId);
    if (!user) {
      user = await this.sellerModel.findById(userId);
    }
    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    if (user.role === Role.SELLER || user.shopName) {
      return {
        success: true,
        message: 'Seller profile retrieved successfully',
        user: {
          _id: user._id,
          role: user.role || Role.SELLER,
          shopName: user.shopName,
          ownerName: user.ownerName,
          email: user.email,
          phone: user.phone,
          alternatePhone: user.alternatePhone,
          profilePhotoUrl: user.profilePhotoUrl || user.shopLogoUrl || user.shopBannerUrl || '',
          isDeletionPending: Boolean(user.isDeletionPending),
          deletionRequest: user.deletionRequest || null,
          shopLogoUrl: user.shopLogoUrl,
          shopCoverUrl: user.shopCoverUrl,
          shopBannerUrl: user.shopBannerUrl,
          shopImages: user.shopImages || [],
          shopVideos: user.shopVideos || [],
          shopAddress: user.shopAddress,
          shopDescription: user.shopDescription,
          openingHours: user.openingHours,
          operatingHoursSchedule: user.operatingHoursSchedule,
          isOpenNow: user.isOpenNow,
          categories: user.categories || [],
          subcategoryNames: user.subcategoryNames || [],
          productTypes: user.productTypes || [],
          minPrice: user.minPrice,
          maxPrice: user.maxPrice,
          discountPercent: user.discountPercent || 0,
          stories: user.stories || [],
          verificationStatus: user.verificationStatus,
          staffMembers: user.staffMembers || [],
        },
      };
    }

    return {
      success: true,
      message: 'Profile retrieved successfully',
      user: {
        _id: user._id,
        role: user.role,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profilePhotoUrl: user.profilePhotoUrl,
        addresses: user.addresses || [],
      },
    };
  }

  async updateProfile(userId: string, dto: any) {
    let user = await this.userModel.findById(userId);
    let seller = null;

    if (!user) {
      seller = await this.sellerModel.findById(userId);
    }

    if (!user && !seller) {
      throw new NotFoundException('Account not found');
    }

    if (seller) {
      if (dto.email && dto.email !== seller.email) {
        const existing = await this.sellerModel.findOne({ email: dto.email });
        if (existing && existing._id.toString() !== seller._id.toString()) {
          throw new ConflictException('Email already exists');
        }
        seller.email = dto.email;
      }

      if (dto.shopName !== undefined) seller.shopName = dto.shopName;
      if (dto.ownerName !== undefined) seller.ownerName = dto.ownerName;
      if (dto.phone !== undefined) seller.phone = dto.phone;
      if (dto.alternatePhone !== undefined) seller.alternatePhone = dto.alternatePhone;
      if (dto.profilePhotoUrl !== undefined) seller.profilePhotoUrl = dto.profilePhotoUrl;
      const incomingDesc = dto.shopDescription !== undefined ? dto.shopDescription : dto.description !== undefined ? dto.description : dto.bio;
      if (incomingDesc !== undefined) seller.shopDescription = incomingDesc;
      if (dto.openingHours !== undefined) seller.openingHours = dto.openingHours;
      if (dto.operatingHoursSchedule !== undefined) seller.operatingHoursSchedule = dto.operatingHoursSchedule;
      if (dto.isOpenNow !== undefined) seller.isOpenNow = dto.isOpenNow;
      if (dto.shopAddress !== undefined) seller.shopAddress = { ...seller.shopAddress, ...dto.shopAddress };
      if (dto.categories !== undefined) seller.categories = dto.categories;
      if (dto.subcategoryNames !== undefined) seller.subcategoryNames = dto.subcategoryNames;
      if (dto.productTypes !== undefined) seller.productTypes = dto.productTypes;
      if (dto.minPrice !== undefined) seller.minPrice = dto.minPrice;
      if (dto.maxPrice !== undefined) seller.maxPrice = dto.maxPrice;
      if (dto.discountPercent !== undefined)
        seller.discountPercent = Math.max(
          0,
          Math.min(100, Number(dto.discountPercent) || 0),
        );
      if (dto.shopCoverUrl !== undefined) seller.shopCoverUrl = dto.shopCoverUrl;
      if (dto.shopBannerUrl !== undefined) seller.shopBannerUrl = dto.shopBannerUrl;
      if (dto.shopLogoUrl !== undefined) seller.shopLogoUrl = dto.shopLogoUrl;
      if (dto.shopImages !== undefined) {
        seller.shopImages = dto.shopImages;
        seller.markModified('shopImages');
      }
      if (dto.shopVideos !== undefined) {
        seller.shopVideos = dto.shopVideos;
        seller.markModified('shopVideos');
      }
      if (dto.staffMembers !== undefined) {
        seller.staffMembers = dto.staffMembers;
        seller.markModified('staffMembers');
      }
      if (dto.bankDetails !== undefined) {
        seller.bankDetails = { ...seller.bankDetails, ...dto.bankDetails };
        seller.markModified('bankDetails');
      }

      await seller.save();

      return {
        message: 'Seller profile updated successfully',
        user: {
          _id: seller._id,
          role: Role.SELLER,
          shopName: seller.shopName,
          ownerName: seller.ownerName,
          email: seller.email,
          phone: seller.phone,
          alternatePhone: seller.alternatePhone,
          profilePhotoUrl: seller.profilePhotoUrl || seller.shopLogoUrl || seller.shopBannerUrl || '',
          shopLogoUrl: seller.shopLogoUrl,
          shopCoverUrl: seller.shopCoverUrl,
          shopBannerUrl: seller.shopBannerUrl,
          shopImages: seller.shopImages || [],
          shopVideos: seller.shopVideos || [],
          shopAddress: seller.shopAddress,
          shopDescription: seller.shopDescription,
          openingHours: seller.openingHours,
          operatingHoursSchedule: seller.operatingHoursSchedule,
          isOpenNow: seller.isOpenNow,
          categories: seller.categories || [],
          subcategoryNames: seller.subcategoryNames || [],
          productTypes: seller.productTypes || [],
          minPrice: seller.minPrice,
          maxPrice: seller.maxPrice,
          discountPercent: seller.discountPercent || 0,
          stories: seller.stories || [],
          verificationStatus: seller.verificationStatus,
          staffMembers: seller.staffMembers || [],
        },
      };
    }

    if (user) {
      if (dto.email && dto.email !== user.email) {
        const existing = await this.userModel.findOne({ email: dto.email });
        if (existing && existing._id.toString() !== user._id.toString()) {
          throw new ConflictException('Email already exists');
        }
        user.email = dto.email;
      }

      if (dto.name !== undefined) user.name = dto.name;
      if (dto.profilePhotoUrl !== undefined)
        user.profilePhotoUrl = dto.profilePhotoUrl;

      await user.save();
      return {
        message: 'Profile updated successfully',
        user: {
          _id: user._id,
          role: user.role,
          name: user.name,
          email: user.email,
          phone: user.phone,
          profilePhotoUrl: user.profilePhotoUrl,
        },
      };
    }

    throw new NotFoundException('Account not found');
  }

  async getUserAddresses(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      success: true,
      data: user.addresses || [],
    };
  }

  async addUserAddress(userId: string, dto: any) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const newAddress = {
      label: dto.label || 'Home',
      fullAddress: dto.fullAddress || '',
      houseFlatFloor: dto.houseFlatFloor || '',
      buildingStreet: dto.buildingStreet || '',
      areaLocality: dto.areaLocality || '',
      receiverName: dto.receiverName || user.name || '',
      receiverPhone: dto.receiverPhone || user.phone || '',
      lat: dto.lat,
      lng: dto.lng,
      isDefault: dto.isDefault || user.addresses.length === 0,
    };

    if (newAddress.isDefault) {
      user.addresses.forEach((addr) => {
        addr.isDefault = false;
      });
    }

    user.addresses.push(newAddress as any);
    await user.save();

    return {
      success: true,
      message: 'Address saved successfully',
      data: user.addresses,
    };
  }

  async updateUserAddress(userId: string, addressId: string, dto: any) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let address = user.addresses.find(
      (addr: any) =>
        (addressId && addressId !== 'undefined' && (addr._id?.toString() === addressId || addr.id?.toString() === addressId)) ||
        (addressId && addr.label?.toLowerCase() === addressId.toLowerCase()) ||
        (dto.label && addr.label?.toLowerCase() === dto.label.toLowerCase())
    );

    if (address) {
      if (dto.label) address.label = dto.label;
      if (dto.fullAddress) address.fullAddress = dto.fullAddress;
      if (dto.houseFlatFloor !== undefined) address.houseFlatFloor = dto.houseFlatFloor;
      if (dto.buildingStreet !== undefined) address.buildingStreet = dto.buildingStreet;
      if (dto.areaLocality !== undefined) address.areaLocality = dto.areaLocality;
      if (dto.lat !== undefined) address.lat = dto.lat;
      if (dto.lng !== undefined) address.lng = dto.lng;
    } else {
      user.addresses.push({
        label: dto.label || 'Home',
        fullAddress: dto.fullAddress || '',
        houseFlatFloor: dto.houseFlatFloor || '',
        buildingStreet: dto.buildingStreet || '',
        areaLocality: dto.areaLocality || '',
        lat: dto.lat,
        lng: dto.lng,
        isDefault: true,
      } as any);
    }

    await user.save();
    return {
      success: true,
      message: 'Address updated successfully',
      data: user.addresses,
    };
  }

  async deleteUserAddress(userId: string, addressId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!addressId || addressId === 'undefined') {
      return {
        success: false,
        message: 'Invalid address ID provided',
        data: user.addresses,
      };
    }

    user.addresses = user.addresses.filter(
      (addr: any) =>
        addr._id?.toString() !== addressId &&
        addr.id?.toString() !== addressId &&
        addr.label?.toLowerCase() !== addressId.toLowerCase()
    );

    await user.save();

    return {
      success: true,
      message: 'Address deleted successfully',
      data: user.addresses,
    };
  }

  async trackUserLocation(userId: string, locationData: any) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (locationData && locationData.lat && locationData.lng) {
      user.lastSelectedLocation = {
        lat: locationData.lat,
        lng: locationData.lng,
        city: locationData.city,
        region: locationData.region,
        country: locationData.country,
        pincode: locationData.pincode,
        display_name: locationData.display_name,
        source: locationData.source || 'user_selection',
      };

      if (!user.locationHistory) {
        user.locationHistory = [];
      }

      // Add to location activity log
      user.locationHistory.push({
        lat: locationData.lat,
        lng: locationData.lng,
        city: locationData.city || 'Unknown',
        display_name: locationData.display_name || locationData.city || '',
        timestamp: new Date(),
      });

      // Keep last 50 entries
      if (user.locationHistory.length > 50) {
        user.locationHistory = user.locationHistory.slice(-50);
      }

      await user.save();
    }

    return {
      success: true,
      message: 'Location activity tracked',
      lastSelectedLocation: user.lastSelectedLocation,
    };
  }

  async getPopularLocalities(userLat?: number, userLng?: number) {
    const popularList = [
      // Jaipur
      { name: 'Mansarovar, Jaipur', lat: 26.8548, lng: 75.7681, city: 'Jaipur' },
      { name: 'Sanganer, Jaipur', lat: 26.8152, lng: 75.7873, city: 'Jaipur' },
      { name: 'Malviya Nagar, Jaipur', lat: 26.8526, lng: 75.8142, city: 'Jaipur' },
      { name: 'Tonk Road, Jaipur', lat: 26.8398, lng: 75.8035, city: 'Jaipur' },
      { name: 'Shyam Nagar, Jaipur', lat: 26.8915, lng: 75.7612, city: 'Jaipur' },
      { name: 'Lal Kothi, Jaipur', lat: 26.8833, lng: 75.8000, city: 'Jaipur' },
      { name: 'Vaishali Nagar, Jaipur', lat: 26.9090, lng: 75.7408, city: 'Jaipur' },
      { name: 'Chitrakoot, Jaipur', lat: 26.9012, lng: 75.7356, city: 'Jaipur' },
      { name: 'Raja Park, Jaipur', lat: 26.8942, lng: 75.8248, city: 'Jaipur' },
      { name: 'C Scheme, Jaipur', lat: 26.9098, lng: 75.8016, city: 'Jaipur' },
      { name: 'MI Road, Jaipur', lat: 26.9189, lng: 75.8115, city: 'Jaipur' },

      // Ajmer
      { name: 'Vaishali Nagar, Ajmer', lat: 26.4789, lng: 74.6312, city: 'Ajmer' },
      { name: 'Panchsheel Nagar, Ajmer', lat: 26.4912, lng: 74.6401, city: 'Ajmer' },
      { name: 'Ana Sagar Circular Rd, Ajmer', lat: 26.4654, lng: 74.6288, city: 'Ajmer' },
      { name: 'Kishan Garh, Ajmer', lat: 26.5742, lng: 74.8683, city: 'Ajmer' },
      { name: 'Makhupura, Ajmer', lat: 26.4102, lng: 74.6612, city: 'Ajmer' },
      { name: 'Adarsh Nagar, Ajmer', lat: 26.4385, lng: 74.6542, city: 'Ajmer' },
      { name: 'Clock Tower, Ajmer', lat: 26.4568, lng: 74.6354, city: 'Ajmer' },
      { name: 'Pushkar Road, Ajmer', lat: 26.4821, lng: 74.5982, city: 'Ajmer' },

      // Kota
      { name: 'Talwandi, Kota', lat: 25.1389, lng: 75.8452, city: 'Kota' },
      { name: 'Vigyan Nagar, Kota', lat: 25.1523, lng: 75.8412, city: 'Kota' },
      { name: 'Rajeev Gandhi Nagar, Kota', lat: 25.1432, lng: 75.8521, city: 'Kota' },
      { name: 'Dadabari, Kota', lat: 25.1612, lng: 75.8314, city: 'Kota' },

      // Jodhpur
      { name: 'Shastri Nagar, Jodhpur', lat: 26.2698, lng: 73.0089, city: 'Jodhpur' },
      { name: 'Sardarpura, Jodhpur', lat: 26.2754, lng: 73.0185, city: 'Jodhpur' },
      { name: 'Ratanada, Jodhpur', lat: 26.2612, lng: 73.0321, city: 'Jodhpur' },

      // Udaipur
      { name: 'Fatehpura, Udaipur', lat: 24.6034, lng: 73.6892, city: 'Udaipur' },
      { name: 'Hiran Magri, Udaipur', lat: 24.5689, lng: 73.7123, city: 'Udaipur' },
      { name: 'Panchwati, Udaipur', lat: 24.5912, lng: 73.6945, city: 'Udaipur' },
    ];

    if (userLat !== undefined && userLng !== undefined) {
      const calculateDist = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };

      const sorted = popularList
        .map((loc) => ({
          ...loc,
          distance: calculateDist(userLat, userLng, loc.lat, loc.lng),
        }))
        .sort((a, b) => a.distance - b.distance);

      const nearby = sorted.filter((loc) => loc.distance <= 50);
      return nearby.length >= 3 ? nearby.slice(0, 10) : sorted.slice(0, 10);
    }

    return popularList.filter((loc) => loc.city === 'Jaipur');
  }

  private parseGoogleAddressComponents(components: any[]) {
    let landmark = '';
    let sublocality2 = '';
    let sublocality1 = '';
    let city = '';
    let region = '';
    let country = '';
    let pincode = '';

    for (const comp of components || []) {
      const types = comp.types || [];
      if (
        types.includes('establishment') ||
        types.includes('premise') ||
        types.includes('point_of_interest') ||
        types.includes('natural_feature') ||
        types.includes('airport') ||
        types.includes('park') ||
        types.includes('colloquial_area') ||
        types.includes('subpremise')
      ) {
        landmark = comp.long_name;
      } else if (
        types.includes('sublocality_level_2') ||
        types.includes('sublocality') ||
        types.includes('neighborhood')
      ) {
        sublocality2 = comp.long_name;
      } else if (types.includes('sublocality_level_1')) {
        sublocality1 = comp.long_name;
      } else if (types.includes('locality')) {
        city = comp.long_name;
      } else if (types.includes('administrative_area_level_1')) {
        region = comp.long_name;
      } else if (types.includes('country')) {
        country = comp.long_name;
      } else if (types.includes('postal_code')) {
        pincode = comp.long_name;
      }
    }

    let cityResult = '';
    const sublocality = sublocality1 || sublocality2;

    if (landmark) {
      cityResult = sublocality1
        ? `${landmark}, ${sublocality1}`
        : `${landmark}, ${city}`;
    } else if (sublocality2 && sublocality1) {
      cityResult = `${sublocality2}, ${sublocality1}`;
    } else {
      cityResult = sublocality || city || 'Selected Location';
    }

    return {
      city: cityResult
        .replace(/\s*(Municipal Corporation|Municipal Council|Tehsil)\s*/gi, '')
        .trim(),
      region,
      country,
      pincode,
    };
  }

  async reverseGeocode(lat: number, lng: number) {
    const googleApiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY');
    if (!googleApiKey) {
      this.logger.error(
        '[reverseGeocode] GOOGLE_MAPS_API_KEY is not configured!',
      );
      return { city: 'Unknown', region: '', country: '', pincode: '' };
    }

    this.logger.log(
      `[reverseGeocode] Google Maps reverse geocode for: ${lat}, ${lng}`,
    );
    try {
      const response = await googleMapsClient.reverseGeocode({
        params: {
          latlng: { lat, lng },
          key: googleApiKey,
        },
      });

      if (response.data?.results && response.data.results.length > 0) {
        const result = response.data.results[0];
        const parsed = this.parseGoogleAddressComponents(
          result.address_components,
        );
        this.logger.log(
          `[reverseGeocode] Resolved: ${parsed.city}, ${parsed.region} ${parsed.pincode}`,
        );
        return {
          ...parsed,
          formatted_address: result.formatted_address || '',
          display_name: result.formatted_address || '',
        };
      }

      this.logger.warn(
        `[reverseGeocode] No results from Google for ${lat}, ${lng}`,
      );
      return {
        city: 'Selected Location',
        region: '',
        country: '',
        pincode: '',
      };
    } catch (error) {
      this.logger.error(
        `[reverseGeocode] Google API error for ${lat}, ${lng}: ${error.message}`,
      );
      return {
        city: 'Selected Location',
        region: '',
        country: '',
        pincode: '',
      };
    }
  }

  async searchLocation(query: string, lat?: number, lng?: number) {
    this.logger.log(
      `[searchLocation] Query: "${query}" | Lat: ${lat} | Lng: ${lng}`,
    );
    const googleApiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY');
    if (!googleApiKey) {
      this.logger.error(
        '[searchLocation] GOOGLE_MAPS_API_KEY is not configured!',
      );
      return [];
    }

    try {
      const params: any = {
        query,
        key: googleApiKey,
        region: 'in',
      };
      if (lat !== undefined && lng !== undefined) {
        params.location = { lat, lng };
        params.radius = 15000; // 15km biasing radius
      }

      const response = await googleMapsClient.textSearch({ params });

      if (response.data?.results) {
        this.logger.log(
          `[searchLocation] Google Places returned ${response.data.results.length} results for "${query}"`,
        );
        const mapped = response.data.results.map((res, index) => {
          const pincodeMatch = res.formatted_address?.match(/\b\d{5,6}\b/);
          const pincode = pincodeMatch ? pincodeMatch[0] : '';

          const addressParts =
            res.formatted_address?.split(',').map((s) => s.trim()) || [];
          const cleanParts = [...addressParts];

          let state = '';
          let country = '';

          if (addressParts.length > 0) {
            // 1. Extract Country
            const lastItem = cleanParts[cleanParts.length - 1];
            if (lastItem && !/\d/.test(lastItem) && lastItem.length > 2) {
              country = lastItem;
              cleanParts.pop(); // Remove country to safely look up state
            }

            // 2. Extract State
            const stateAndPostcodeItem =
              cleanParts[cleanParts.length - 1] || '';
            const cleanState = stateAndPostcodeItem
              .replace(/\b\d{5,6}\b/g, '')
              .replace(/[-\s]+$/, '')
              .trim();
            if (cleanState && cleanState.length > 2) {
              state = cleanState;
            } else if (cleanParts.length > 1) {
              const previousItem = cleanParts[cleanParts.length - 2] || '';
              if (previousItem && !/\d/.test(previousItem)) {
                state = previousItem;
              }
            }
          }

          // Find general area dynamically (e.g. "Mansarovar" from "Sector 7, Mansarovar, Jaipur")
          let generalArea = '';
          const resName = res.name || 'Selected Location';
          if (cleanParts.length >= 3) {
            const areaIndex = cleanParts.length - 3;
            if (areaIndex >= 0 && cleanParts[areaIndex]) {
              const possibleArea = cleanParts[areaIndex].trim();
              if (
                possibleArea.toLowerCase() !== resName.toLowerCase() &&
                possibleArea.toLowerCase() !== state.toLowerCase() &&
                possibleArea.toLowerCase() !== country.toLowerCase()
              ) {
                generalArea = possibleArea;
              }
            }
          }

          if (!generalArea && addressParts.length > 1) {
            const secondPart = addressParts[1].trim();
            if (
              secondPart.toLowerCase() !== resName.toLowerCase() &&
              !/\d/.test(secondPart)
            ) {
              generalArea = secondPart;
            }
          }

          const suburbName = generalArea
            ? `${resName}, ${generalArea}`
            : resName;

          const resLat = res.geometry?.location?.lat;
          const resLng = res.geometry?.location?.lng;

          return {
            place_id: res.place_id || (index + 1).toString(),
            lat: resLat !== undefined ? resLat.toString() : '26.8530',
            lon: resLng !== undefined ? resLng.toString() : '75.7600',
            display_name: `${resName}, ${res.formatted_address}`,
            address: {
              suburb: suburbName,
              city: suburbName,
              state,
              postcode: pincode,
              country,
            },
          };
        });
        this.logger.log(
          `[searchLocation] Search Results: ${JSON.stringify(mapped, null, 2)}`,
        );
        return mapped;
      }

      this.logger.warn(
        `[searchLocation] No results from Google Places for "${query}"`,
      );
      return [];
    } catch (error: any) {
      this.logger.error(
        `[searchLocation] Google Places API error for "${query}": ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Centralised JWT token builder.
   * JWT payload: { sub: id, role } — uniform across all roles.
   */
  private buildTokenResponse(
    id: string,
    role: Role,
    userFields: object,
  ): object {
    const payload = { sub: id, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: '1d',
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '365d',
    });

    return {
      accessToken,
      refreshToken,
      user: { _id: id, role, ...userFields },
    };
  }

  async toggleFavoriteSeller(userId: string, sellerId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const seller = await this.sellerModel.findById(sellerId);
    if (!seller) {
      throw new NotFoundException('Seller not found');
    }

    if (!user.favoriteSellers) {
      user.favoriteSellers = [];
    }

    const index = user.favoriteSellers.findIndex(
      (id) => id.toString() === sellerId,
    );

    let isFavorite = false;
    if (index > -1) {
      user.favoriteSellers.splice(index, 1);
    } else {
      user.favoriteSellers.push(seller._id as any);
      isFavorite = true;

      // Dispatch push notification to seller
      try {
        await this.fcmNotificationService.sendToSeller(
          seller._id.toString(),
          'New Follower! 🎉',
          `${user.name || 'A customer'} started following your shop ${seller.shopName}!`,
          {
            type: 'new_follower',
            userId: user._id.toString(),
            userName: user.name || 'Customer',
            sellerId: seller._id.toString(),
          },
        );
      } catch (err) {
        this.logger.warn('Failed to send follower push notification', err?.message);
      }

      // Add in-app notification to seller
      if (!seller.notifications) seller.notifications = [];
      seller.notifications.unshift({
        _id: new Types.ObjectId(),
        title: 'New Follower! 🎉',
        message: `${user.name || 'A customer'} started following your store.`,
        type: 'new_follower',
        data: {
          userId: user._id.toString(),
          userName: user.name || 'Customer',
          sellerId: seller._id.toString(),
        },
        isRead: false,
        createdAt: new Date(),
      });
      seller.markModified('notifications');

      const todayStr = new Date().toISOString().split('T')[0];
      let dailyFollowers = seller.dailyFollowers || [];
      const fIndex = dailyFollowers.findIndex((d: any) => d.date === todayStr);
      if (fIndex > -1) {
        dailyFollowers[fIndex].count = (dailyFollowers[fIndex].count || 0) + 1;
      } else {
        dailyFollowers.push({ date: todayStr, count: 1 });
      }
      seller.dailyFollowers = dailyFollowers;
      seller.markModified('dailyFollowers');

      await seller.save();
    }

    user.markModified('favoriteSellers');
    await user.save();
    return {
      success: true,
      isFavorite,
      message: isFavorite ? 'Added to favorites' : 'Removed from favorites',
    };
  }

  async getFavoriteSellers(userId: string, page = 1, limit = 10) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(50, Number(limit) || 10));

    const user = await this.userModel.findById(userId).select('favoriteSellers');
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const totalCount = user.favoriteSellers ? user.favoriteSellers.length : 0;
    const totalPages = Math.ceil(totalCount / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;

    const pagedIds = (user.favoriteSellers || []).slice(startIndex, startIndex + limitNum);
    const sellers = await this.sellerModel.find({ _id: { $in: pagedIds } });

    return {
      success: true,
      data: sellers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages,
        hasMore: pageNum < totalPages,
      },
    };
  }

  /**
   * Get seller dashboard metrics & sales stats.
   */
  }
