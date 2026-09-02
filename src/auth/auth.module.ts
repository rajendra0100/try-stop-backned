import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { SharedAuthController } from './controllers/shared-auth.controller'; // shared: refresh + profile
import { UserAuthController } from './controllers/user-auth.controller';
import { SellerAuthController } from './controllers/seller-auth.controller';

import { User, UserSchema } from './schemas/user.schema';
import { Seller, SellerSchema } from './schemas/seller.schema';
import { SellerDeletionRequest, SellerDeletionRequestSchema } from './schemas/seller-deletion-request.schema';
import { Admin, AdminSchema } from '../admin-auth/schemas/admin.schema';
import { DeletedUser, DeletedUserSchema } from './schemas/deleted-user.schema';
import { Transaction, TransactionSchema } from '../payment/schemas/transaction.schema';

import { JwtStrategy } from './strategies/jwt.strategy';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { OtpModule } from '../otp/otp.module';
import { NotificationModule } from '../notification/notification.module';
import { FcmNotificationModule } from '../fcm-notification/fcm-notification.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Seller.name, schema: SellerSchema },
      { name: SellerDeletionRequest.name, schema: SellerDeletionRequestSchema },
      { name: Admin.name, schema: AdminSchema },
      { name: DeletedUser.name, schema: DeletedUserSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    PassportModule,
    JwtModule.register({}),
    FileStorageModule,
    OtpModule,
    NotificationModule,
    FcmNotificationModule,
  ],
  controllers: [
    SharedAuthController,  // POST /auth/refresh, GET /auth/profile
    UserAuthController,    // POST /auth/register/user, /auth/login/user, /auth/login/user/verify
    SellerAuthController,  // POST /auth/register/seller, /auth/login/seller
  ],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtStrategy],
})
export class AuthModule {}
