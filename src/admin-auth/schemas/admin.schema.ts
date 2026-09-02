import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Role } from '../../common/enums/role.enum';

export type AdminDocument = Admin & Document;

/**
 * Admin Schema — handles both superadmin and subadmin credentials.
 * Kept in the admin-auth directory for complete folder separation.
 */
@Schema({ timestamps: true, collection: 'admins' })
export class Admin {
  @Prop({ required: true })
  name: string;

  @Prop({ unique: true, required: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ type: String, enum: [Role.SUPERADMIN, Role.SUBADMIN], required: true })
  role: Role;

  /** Fine-grained permissions for subadmin — what they can and cannot manage */
  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop()
  profilePhotoUrl?: string;
}

export const AdminSchema = SchemaFactory.createForClass(Admin);
