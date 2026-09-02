import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { Admin, AdminSchema } from './schemas/admin.schema';

import { User, UserSchema } from '../auth/schemas/user.schema';
import { Seller, SellerSchema } from '../auth/schemas/seller.schema';
import { SellerDeletionRequest, SellerDeletionRequestSchema } from '../auth/schemas/seller-deletion-request.schema';

/**
 * AdminAuthModule — completely separate from the public AuthModule.
 * Admin routes live under /admin-auth/ and should be infrastructure-restricted.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Admin.name, schema: AdminSchema },
      { name: User.name, schema: UserSchema },
      { name: Seller.name, schema: SellerSchema },
      { name: SellerDeletionRequest.name, schema: SellerDeletionRequestSchema },
    ]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: '24hrs' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService],
  exports: [AdminAuthService],
})
export class AdminAuthModule {}
