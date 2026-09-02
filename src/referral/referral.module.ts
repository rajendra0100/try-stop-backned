import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';
import { Referral, ReferralSchema } from './schemas/referral.schema';
import { ReferralConfig, ReferralConfigSchema } from './schemas/referral-config.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { WalletModule } from '../wallet/wallet.module';
import { FcmNotificationModule } from '../fcm-notification/fcm-notification.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Referral.name, schema: ReferralSchema },
      { name: ReferralConfig.name, schema: ReferralConfigSchema },
      { name: User.name, schema: UserSchema },
    ]),
    WalletModule,
    forwardRef(() => FcmNotificationModule),
  ],
  controllers: [ReferralController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
