import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { User, UserDocument } from "../auth/schemas/user.schema";
import { Transaction, TransactionDocument } from "../payment/schemas/transaction.schema";
import { UserVoucher, UserVoucherDocument } from "../voucher/schemas/user-voucher.schema";
import { Role } from "../common/enums/role.enum";
import { UpdateUserDto } from "./dto/update-user.dto";

export interface UserListItem {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  profilePhotoUrl?: string;
  walletBalance: number;
  voucherBalance?: number;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  createdAt: string;
}

export interface PaginatedUsersResponse {
  users: UserListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(UserVoucher.name) private readonly userVoucherModel: Model<UserVoucherDocument>,
  ) {}

  /**
   * List all registered customers/users (Role.USER) with optional search & pagination.
   */
  async listUsers(page = 1, limit = 10, search = ""): Promise<PaginatedUsersResponse> {
    const query: any = { role: Role.USER };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const parsedLimit = Number(limit);

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .populate("referredBy", "name phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean<UserListItem[]>(),
      this.userModel.countDocuments(query),
    ]);

    return {
      users,
      total,
      page: Number(page),
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit),
    };
  }

  /**
   * Get detailed profile of a single user including all transactions and purchased vouchers.
   */
  async getUserDetails(id: string) {
    const user = await this.userModel.findOne({ _id: id, role: Role.USER }).populate("referredBy", "name phone").lean();
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const userObjectId = new Types.ObjectId(id);

    const [transactions, userVouchers] = await Promise.all([
      this.transactionModel
        .find({ customerId: userObjectId })
        .populate("sellerId", "shopName shopLogoUrl shopAddress phone")
        .sort({ createdAt: -1 })
        .lean(),
      this.userVoucherModel
        .find({ userId: userObjectId })
        .populate("voucherConfigId", "title description faceValue discountPercent")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const totalSpent = transactions
      .filter((t: any) => t.paymentStatus === "paid")
      .reduce((sum: number, t: any) => sum + (t.totalAmount || 0), 0);

    const totalCashbackEarned = transactions
      .filter((t: any) => t.paymentStatus === "paid")
      .reduce((sum: number, t: any) => sum + (t.cashbackEarned || 0), 0);

    const totalVoucherSpent = transactions
      .filter((t: any) => t.paymentStatus === "paid")
      .reduce((sum: number, t: any) => sum + (t.voucherAmountUsed || 0), 0);

    return {
      user,
      stats: {
        totalSpent,
        totalCashbackEarned,
        totalVoucherSpent,
        transactionsCount: transactions.length,
        vouchersCount: userVouchers.length,
        cashbackBalance: user.walletBalance || 0,
        voucherBalance: user.voucherBalance || 0,
      },
      transactions,
      userVouchers,
    };
  }

  /**
   * Update a user profile and balance (admin-only).
   */
  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.userModel.findOne({ _id: id, role: Role.USER });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.userModel.findOne({ email: dto.email });
      if (existing) {
        throw new ConflictException("Email already exists");
      }
    }

    if (dto.phone && dto.phone !== user.phone) {
      const existing = await this.userModel.findOne({ phone: dto.phone });
      if (existing) {
        throw new ConflictException("Phone number already exists");
      }
    }

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.walletBalance !== undefined) user.walletBalance = dto.walletBalance;
    if (dto.isEmailVerified !== undefined) user.isEmailVerified = dto.isEmailVerified;
    if (dto.isPhoneVerified !== undefined) user.isPhoneVerified = dto.isPhoneVerified;

    await user.save();
    return user;
  }

  /**
   * Delete a user (admin-only).
   */
  async deleteUser(id: string) {
    const user = await this.userModel.findOne({ _id: id, role: Role.USER });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    await this.userModel.deleteOne({ _id: id });
    return { message: "User deleted successfully" };
  }
}
