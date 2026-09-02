import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';

export type UserDocument = User & Document;

@Schema()
export class Address {
  @Prop({ required: true })
  label: string; // e.g. "Home", "Office", "Other"

  @Prop({ required: true })
  fullAddress: string;

  @Prop({ required: false })
  houseFlatFloor?: string;

  @Prop({ required: false })
  buildingStreet?: string;

  @Prop({ required: false })
  areaLocality?: string;

  @Prop({ required: false })
  receiverName?: string;

  @Prop({ required: false })
  receiverPhone?: string;

  @Prop()
  lat?: number;

  @Prop()
  lng?: number;

  @Prop({ default: false })
  isDefault: boolean;
}
export const AddressSchema = SchemaFactory.createForClass(Address);

/**
 * User Schema — role: 'user' only.
 * Password-free. Authentication is exclusively via OTP.
 */
@Schema({ timestamps: true })
export class User {
  @Prop({ required: false })
  name?: string;

  @Prop({ unique: true, sparse: true })
  email?: string;

  @Prop({ unique: true, sparse: true })
  phone?: string;

  @Prop()
  profilePhotoUrl?: string;

  @Prop({ type: [AddressSchema], default: [] })
  addresses: Address[];

  @Prop({ type: Object, default: null })
  lastSelectedLocation?: {
    lat: number;
    lng: number;
    city?: string;
    region?: string;
    country?: string;
    pincode?: string;
    display_name?: string;
    source?: string;
  };

  @Prop({ type: Array, default: [] })
  locationHistory: Array<{
    lat: number;
    lng: number;
    city?: string;
    display_name?: string;
    timestamp: Date;
  }>;

  /** Fixed to USER — no role field needed, but kept for JWT strategy compatibility */
  @Prop({ type: String, enum: Role, default: Role.USER })
  role: Role;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: false })
  isPhoneVerified: boolean;

  /** Denormalized wallet balance for fast reads — always updated atomically with wallet ledger writes */
  @Prop({ default: 0 })
  walletBalance: number;

  @Prop({ default: 0 })
  voucherBalance: number;

  /** Per-user wallet usage cap override (e.g. 0.80 = 80%). If unset, global cap applies. */
  @Prop({ type: Number, default: null })
  walletUsageCap: number | null;

  /** Firebase Cloud Messaging token for push notifications */
  @Prop({ type: String, default: null })
  fcmToken: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  referredBy?: Types.ObjectId | null;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Seller' }], default: [] })
  favoriteSellers: Types.ObjectId[];
}

export const UserSchema = SchemaFactory.createForClass(User);
