import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';

export type SellerDocument = Seller & Document;

// ─── Sub-documents ────────────────────────────────────────────────────────────

@Schema({ _id: false })
class ShopAddress {
  @Prop({ required: true })
  fullAddress: string;

  @Prop()
  lat?: number;

  @Prop()
  lng?: number;
}

@Schema({ _id: false })
class BusinessDocuments {
  @Prop()
  gstNumber?: string; // Optional for small/unregistered sellers

  @Prop()
  gstCertificateUrl?: string;

  @Prop()
  panNumber?: string;

  @Prop()
  panImageUrl?: string;
}

@Schema({ _id: false })
export class BankDetails {
  @Prop()
  bankAccountNumber?: string;

  @Prop()
  ifscCode?: string;

  @Prop()
  accountHolderName?: string;

  @Prop()
  bankName?: string;

  @Prop()
  branchName?: string;

  @Prop()
  upiId?: string;
}

// ─── Main Schema ──────────────────────────────────────────────────────────────

/**
 * Seller Schema — password-based auth. Separate collection from User.
 * Sensitive document numbers must be masked in non-admin responses.
 * Role is fixed to SELLER for JWT strategy compatibility.
 */
@Schema({ timestamps: true })
export class Seller {
  @Prop({ required: true })
  shopName: string;

  @Prop({ required: true })
  ownerName: string;

  @Prop({ unique: true, required: true, sparse: true })
  email: string;

  /** Password is required for sellers. Excluded from all query results by default. */
  @Prop({ required: true, select: false })
  password: string;

  @Prop({ unique: true, sparse: true })
  phone?: string;

  @Prop({ type: String, default: '' })
  alternatePhone?: string;

  @Prop({ type: String, default: '' })
  profilePhotoUrl?: string;

  @Prop()
  shopLogoUrl?: string;

  @Prop()
  shopBannerUrl?: string;

  @Prop({ type: BusinessDocuments })
  businessDocuments?: BusinessDocuments;

  @Prop({ type: BankDetails, select: false })
  bankDetails?: BankDetails;

  @Prop({ type: String, select: false, default: null })
  securityPasscode?: string | null;

  @Prop({ type: Boolean, default: false })
  isPasscodeSet?: boolean;

  @Prop({ type: ShopAddress })
  shopAddress?: ShopAddress;

  @Prop({ type: String, default: '' })
  shopDescription?: string;

  @Prop({ type: Boolean, default: true })
  isOpenNow?: boolean;

  @Prop({ type: String, default: '10:00 AM - 09:30 PM (All 7 Days)' })
  openingHours?: string;

  @Prop({ type: Object, default: null })
  operatingHoursSchedule?: Record<string, any>;

  /** Fashion categories this seller sells in */
  @Prop({ type: [String], default: [] })
  categories: string[]; // e.g. ['men', 'women', 'kids', 'accessories']

  /** Subcategories this seller sells in */
  @Prop({ type: [String], default: [] })
  subcategoryNames?: string[];

  /** Types of products this seller sells (e.g. shirt, pant, saree) */
  @Prop({ type: [String], default: [] })
  productTypes: string[]; // e.g. ['shirt', 'pant', 'saree']

  /** Minimum price range for products in this shop (e.g. 100) */
  @Prop({ type: Number, default: 0 })
  minPrice?: number;

  /** Maximum price range for products in this shop (e.g. 4000) */
  @Prop({ type: Number, default: 0 })
  maxPrice?: number;

  @Prop({ enum: ['pending', 'approved', 'rejected'], default: 'pending' })
  verificationStatus: string;

  @Prop({ type: Boolean, default: false })
  isDeletionPending?: boolean;

  @Prop({ type: Object, default: null })
  deletionRequest?: Record<string, any>;

  @Prop({ type: Array, default: [] })
  staffMembers?: Array<{
    _id?: Types.ObjectId | string;
    name: string;
    phone: string;
    email: string;
    designation?: string;
    profilePhotoUrl?: string;
    permissions: {
      canViewProfile?: boolean;
      canAccessProfile?: boolean;
      canEditProfile?: boolean;
      canViewStaff?: boolean;
      canEditStaff?: boolean;
      canManageStaff?: boolean;
      canViewShop?: boolean;
      canEditShop?: boolean;
      canManageProducts?: boolean;
    };
    status: 'pending' | 'active';
    otp?: string;
    otpExpiresAt?: Date;
    addedAt?: Date;
  }>;

  /** Platform commission per sale — set by Admin */
  @Prop({ type: Number })
  commissionRate?: number;

  /** Payment gateway fee rate per sale — set by Admin (e.g. 0.008 = 0.8%, 0.005 = 0.5%) */
  @Prop({ type: Number })
  customPgFeeRate?: number;

  /** Fixed role for JWT strategy */
  @Prop({ type: String, default: Role.SELLER })
  role: Role;

  // ─── Cashfree Vendor Fields ─────────────────────────────────────────────────

  /** Cashfree vendor ID assigned after vendor registration */
  @Prop({ type: String, default: null })
  cashfreeVendorId: string | null;

  /** Cashfree vendor onboarding status */
  @Prop({ enum: ['not_registered', 'pending', 'active', 'suspended'], default: 'not_registered' })
  cashfreeVendorStatus: string;

  // ─── Ranking Fields (cached, updated by ranking cron job) ──────────────────

  /** Cached average rating from reviews */
  @Prop({ default: 0 })
  avgRating: number;

  /** Cached total review count */
  @Prop({ default: 0 })
  reviewCount: number;

  /** Cached ranking score computed by ranking engine (§7) */
  @Prop({ default: 0 })
  rankingScore: number;

  /** 30-day rolling transaction volume (updated by ranking cron) */
  @Prop({ default: 0 })
  onlineTxnVolume30d: number;

  // ─── Offer & Promotion Fields (managed by Admin) ───────────────────────────

  /** Active offer tags set by admin (e.g. 'flat_50_off', 'buy1get1') */
  @Prop({ type: [String], default: [] })
  offerTags: string[];

  /** Current discount percentage (0 = no discount) */
  @Prop({ default: 0 })
  discountPercent: number;

  /** Firebase Cloud Messaging token for push notifications */
  @Prop({ type: String, default: null })
  fcmToken: string | null;

  // ─── Analytics & Traffic Tracking Fields ────────────────────────────────────

  /** Total store visit count */
  @Prop({ type: Number, default: 0 })
  totalStoreVisits: number;

  /** Total story views across all time */
  @Prop({ type: Number, default: 0 })
  totalStoryViews: number;

  /** Daily store visits tracking */
  @Prop({
    type: [{ date: { type: String }, count: { type: Number, default: 0 } }],
    default: [],
  })
  dailyStoreVisits: { date: string; count: number }[];

  /** Daily story views tracking */
  @Prop({
    type: [{ date: { type: String }, count: { type: Number, default: 0 } }],
    default: [],
  })
  dailyStoryViews: { date: string; count: number }[];

  /** Daily new followers tracking */
  @Prop({
    type: [{ date: { type: String }, count: { type: Number, default: 0 } }],
    default: [],
  })
  dailyFollowers: { date: string; count: number }[];

  /** Directions clicked count */
  @Prop({ type: Number, default: 0 })
  directionClicks: number;

  /** Daily directions tracking */
  @Prop({
    type: [{ date: { type: String }, count: { type: Number, default: 0 } }],
    default: [],
  })
  dailyDirectionClicks: { date: string; count: number }[];

  /** Direct calls clicked count */
  @Prop({ type: Number, default: 0 })
  callClicks: number;

  /** Daily calls tracking */
  @Prop({
    type: [{ date: { type: String }, count: { type: Number, default: 0 } }],
    default: [],
  })
  dailyCallClicks: { date: string; count: number }[];

  // ─── Media & Gallery Fields ─────────────────────────────────────────────────

  /** Cover image URL (full-width hero on shop details page) */
  @Prop()
  shopCoverUrl?: string;

  /** Gallery images of shop/products uploaded by seller */
  @Prop({ type: [String], default: [] })
  shopImages: string[];

  /** Intro video URLs (length/count configurable by admin) */
  @Prop({ type: [String], default: [] })
  shopVideos: string[];

  /** Instagram-style stories (media & text announcements) */
  @Prop({
    type: [
      {
        imageUrl: { type: String, default: '' },
        storyType: { type: String, enum: ['media', 'text'], default: 'media' },
        text: { type: String, default: '' },
        bgColor: { type: String, default: '' },
        title: { type: String, default: '' },
        description: { type: String, default: '' },
        caption: { type: String, default: '' },
        viewCount: { type: Number, default: 0 },
        views: {
          type: [
            {
              userId: { type: String },
              userName: { type: String },
              viewedAt: { type: Date, default: Date.now },
            },
          ],
          default: [],
        },
        isHidden: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  stories: {
    _id?: any;
    imageUrl?: string;
    storyType?: 'media' | 'text';
    text?: string;
    bgColor?: string;
    title?: string;
    description?: string;
    caption?: string;
    viewCount?: number;
    views?: { userId: string; userName?: string; viewedAt: Date }[];
    isHidden?: boolean;
    createdAt: Date;
  }[];

  /** In-app notifications for seller (followers, payments, story alerts) */
  @Prop({
    type: [
      {
        title: { type: String, required: true },
        message: { type: String, required: true },
        type: { type: String, default: 'general' },
        data: { type: Object, default: {} },
        isRead: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  notifications: {
    _id?: any;
    title: string;
    message: string;
    type?: string;
    data?: any;
    isRead?: boolean;
    createdAt: Date;
  }[];
}

export const SellerSchema = SchemaFactory.createForClass(Seller);

// ─── Indexes ────────────────────────────────────────────────────────────────
SellerSchema.index({ rankingScore: -1 }); // Shop listing sorted by rank
SellerSchema.index({ cashfreeVendorId: 1 }); // Vendor lookup
