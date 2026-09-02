import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { SellerService } from "./seller.service";
import { SellerController } from "./seller.controller";
import { Seller, SellerSchema } from "../auth/schemas/seller.schema";
import { User, UserSchema } from "../auth/schemas/user.schema";
import {
  SellerDeletionRequest,
  SellerDeletionRequestSchema,
} from "../auth/schemas/seller-deletion-request.schema";
import {
  Transaction,
  TransactionSchema,
} from "../payment/schemas/transaction.schema";
import { OtpModule } from "../otp/otp.module";
import { NotificationModule } from "../notification/notification.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Seller.name, schema: SellerSchema },
      { name: User.name, schema: UserSchema },
      { name: SellerDeletionRequest.name, schema: SellerDeletionRequestSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    OtpModule,
    NotificationModule,
  ],
  controllers: [SellerController],
  providers: [SellerService],
  exports: [SellerService],
})
export class SellerModule {}
