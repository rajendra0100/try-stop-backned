import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AdController } from './ad.controller';
import { AdService } from './ad.service';
import { Ad, AdSchema } from './schemas/ad.schema';
import { AdPricingConfig, AdPricingConfigSchema } from './schemas/ad-pricing-config.schema';
import { Seller, SellerSchema } from '../auth/schemas/seller.schema';
import { PaymentModule } from '../payment/payment.module';

/**
 * AdModule — ad campaigns, pricing config, and ad-serving/ranking logic.
 *
 * Depends on PaymentModule (CashfreeService) because ads are paid
 * through the same Cashfree PG order flow.
 *
 * §8.4 Future path: the resolveAdsForSlot() method in AdService is a
 * self-contained function whose internal logic can be swapped to a
 * bid-based auction without touching callers or this module structure.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ad.name, schema: AdSchema },
      { name: AdPricingConfig.name, schema: AdPricingConfigSchema },
      { name: Seller.name, schema: SellerSchema },
    ]),
    PaymentModule, // For CashfreeService (ad payment orders)
  ],
  controllers: [AdController],
  providers: [AdService],
  exports: [AdService],
})
export class AdModule {}
