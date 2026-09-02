import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { User, UserSchema } from "../auth/schemas/user.schema";
import { Transaction, TransactionSchema } from "../payment/schemas/transaction.schema";
import { UserVoucher, UserVoucherSchema } from "../voucher/schemas/user-voucher.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: UserVoucher.name, schema: UserVoucherSchema },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
