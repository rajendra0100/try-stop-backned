import { connect, model, Schema, Types } from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'qa'}` });

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://trystop_qa:RKRptpDy7l1BHo4T@trystopqa.mswlyam.mongodb.net/trystop_qa?appName=trystopqa';

const UserSchema = new Schema({
  name: String,
  email: { type: String, unique: true },
  phone: { type: String, unique: true },
  profilePhotoUrl: { type: String, default: '' },
  role: { type: String, default: 'user' },
  isEmailVerified: { type: Boolean, default: false },
  isPhoneVerified: { type: Boolean, default: false },
  walletBalance: { type: Number, default: 0 },
  addresses: [{ label: String, fullAddress: String, isDefault: Boolean }],
}, { timestamps: true });

const SellerSchema = new Schema({
  shopName: String,
  ownerName: String,
  email: { type: String, unique: true },
  phone: { type: String, unique: true },
  status: { type: String, default: 'pending' },
  commissionRate: { type: Number, default: 0.1 },
  cashfreeVendorId: { type: String, default: null },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const TransactionSchema = new Schema({
  customerId: { type: Schema.Types.ObjectId, ref: 'User' },
  sellerId: { type: Schema.Types.ObjectId, ref: 'Seller' },
  cashfreeOrderId: String,
  totalAmount: Number,
  walletAmountUsed: Number,
  amountPaidOnline: Number,
  couponCode: { type: String, default: null },
  couponDiscount: { type: Number, default: 0 },
  appliedCommissionRate: Number,
  commissionAmount: Number,
  pgFeeTotal: Number,
  pgFeeTrystopShare: Number,
  pgFeeSellerShare: Number,
  sellerNetPayout: Number,
  cashbackEarned: { type: Number, default: 0 },
  appliedCashbackRate: { type: Number, default: 0 },
  paymentStatus: { type: String, default: 'pending' },
  cashfreePaymentStatus: { type: String, default: null },
  paidAt: { type: Date, default: null }
}, { timestamps: true });

const WalletTransactionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  amount: Number,
  type: String, // 'credit' | 'debit'
  reason: String,
  relatedTransactionId: { type: Schema.Types.ObjectId, default: null }
}, { timestamps: true });

const User = model('User', UserSchema);
const Seller = model('Seller', SellerSchema);
const Transaction = model('Transaction', TransactionSchema);
const WalletTransaction = model('WalletTransaction', WalletTransactionSchema);

async function main() {
  await connect(MONGO_URI);
  console.log('Connected to MongoDB:', MONGO_URI);

  // 1. Seed Users
  const userCount = await User.countDocuments();
  let users: any[] = [];
  if (userCount === 0) {
    console.log('Seeding mock users...');
    const mockUsers = [
      { name: 'Rahul Sharma', email: 'rahul.sharma@example.com', phone: '9876543210', walletBalance: 1250, isEmailVerified: true, isPhoneVerified: true, addresses: [{ label: 'Home', fullAddress: 'Flat 402, Shanti Heights, Sector 12, Dwarka, New Delhi', isDefault: true }] },
      { name: 'Priya Patel', email: 'priya.patel@example.com', phone: '9876543211', walletBalance: 450, isEmailVerified: true, isPhoneVerified: false, addresses: [{ label: 'Office', fullAddress: 'Building A, Tech Park, Gachibowli, Hyderabad', isDefault: true }] },
      { name: 'Amit Kumar', email: 'amit.kumar@example.com', phone: '9876543212', walletBalance: 3200, isEmailVerified: false, isPhoneVerified: true, addresses: [] },
      { name: 'Anjali Singh', email: 'anjali.singh@example.com', phone: '9876543213', walletBalance: 0, isEmailVerified: true, isPhoneVerified: true, addresses: [] },
      { name: 'Vikram Rathore', email: 'vikram.r@example.com', phone: '9876543214', walletBalance: 890, isEmailVerified: true, isPhoneVerified: true, addresses: [] },
      { name: 'Neha Gupta', email: 'neha.gupta@example.com', phone: '9876543215', walletBalance: 150, isEmailVerified: false, isPhoneVerified: false, addresses: [] },
      { name: 'Siddharth Verma', email: 'sid.v@example.com', phone: '9876543216', walletBalance: 5000, isEmailVerified: true, isPhoneVerified: true, addresses: [] },
      { name: 'Karan Johar', email: 'karan.j@example.com', phone: '9876543217', walletBalance: 120, isEmailVerified: true, isPhoneVerified: false, addresses: [] },
      { name: 'Sneha Roy', email: 'sneha.roy@example.com', phone: '9876543218', walletBalance: 0, isEmailVerified: false, isPhoneVerified: true, addresses: [] },
      { name: 'Rohan Mehta', email: 'rohan.m@example.com', phone: '9876543219', walletBalance: 750, isEmailVerified: true, isPhoneVerified: true, addresses: [] },
    ];
    users = await User.insertMany(mockUsers);
    console.log(`Seeded ${users.length} users successfully!`);
  } else {
    users = await User.find({});
    console.log(`Found ${users.length} existing users.`);
  }

  // 2. Seed Sellers
  const sellerCount = await Seller.countDocuments();
  let sellers: any[] = [];
  if (sellerCount === 0) {
    console.log('Seeding mock sellers...');
    const mockSellers = [
      { shopName: 'Vogue Apparel', ownerName: 'Rajesh Mehra', email: 'rajesh@vogueapparel.com', phone: '8765432100', status: 'approved', commissionRate: 0.1, cashfreeVendorId: 'VEND_001', isActive: true },
      { shopName: 'Urban Wear', ownerName: 'Manish Malhotra', email: 'manish@urbanwear.com', phone: '8765432101', status: 'approved', commissionRate: 0.12, cashfreeVendorId: 'VEND_002', isActive: true },
      { shopName: 'Denim Hub', ownerName: 'Sanjay Dutt', email: 'sanjay@denimhub.com', phone: '8765432102', status: 'approved', commissionRate: 0.08, cashfreeVendorId: 'VEND_003', isActive: true },
      { shopName: 'Footwear World', ownerName: 'Kabir Khan', email: 'kabir@footwearworld.com', phone: '8765432103', status: 'approved', commissionRate: 0.1, cashfreeVendorId: 'VEND_004', isActive: true },
      { shopName: 'Ethnic Pride', ownerName: 'Aditya Chopra', email: 'aditya@ethnicpride.com', phone: '8765432104', status: 'pending', commissionRate: 0.1, cashfreeVendorId: null, isActive: true },
    ];
    sellers = await Seller.insertMany(mockSellers);
    console.log(`Seeded ${sellers.length} sellers successfully!`);
  } else {
    sellers = await Seller.find({});
    console.log(`Found ${sellers.length} existing sellers.`);
  }

  // 3. Seed Transactions and Wallet Transactions
  const txnCount = await Transaction.countDocuments();
  if (txnCount === 0 && users.length > 0 && sellers.length > 0) {
    console.log('Seeding mock transactions over the last 6 months...');
    const now = new Date();
    const transactionsData: any[] = [];
    const walletTransactionsData: any[] = [];

    // Helper to generate transaction date in the past
    const getDateMonthsAgo = (months: number, day: number) => {
      const d = new Date();
      d.setMonth(now.getMonth() - months);
      d.setDate(day);
      d.setHours(12, 0, 0, 0);
      return d;
    };

    // We will generate transactions for each of the last 6 months
    // Let's assume now is July 2026. The months would be Jan, Feb, Mar, Apr, May, Jun, Jul.
    const monthData = [
      { monthOffset: 6, txns: [{ total: 5000, wallet: 1500 }, { total: 4200, wallet: 2000 }, { total: 3000, wallet: 500 }] }, // 6 months ago (Jan)
      { monthOffset: 5, txns: [{ total: 6000, wallet: 2000 }, { total: 4800, wallet: 1000 }, { total: 5500, wallet: 2500 }] }, // 5 months ago (Feb)
      { monthOffset: 4, txns: [{ total: 8000, wallet: 3500 }, { total: 9500, wallet: 4000 }, { total: 7200, wallet: 2200 }] }, // 4 months ago (Mar)
      { monthOffset: 3, txns: [{ total: 4000, wallet: 1200 }, { total: 6200, wallet: 2800 }, { total: 5100, wallet: 1800 }] }, // 3 months ago (Apr)
      { monthOffset: 2, txns: [{ total: 5800, wallet: 2100 }, { total: 7500, wallet: 3000 }, { total: 6900, wallet: 2400 }] }, // 2 months ago (May)
      { monthOffset: 1, txns: [{ total: 7200, wallet: 3100 }, { total: 8400, wallet: 3900 }, { total: 6500, wallet: 2200 }] }, // 1 month ago (Jun)
      { monthOffset: 0, txns: [{ total: 9000, wallet: 4200 }, { total: 5600, wallet: 1800 }, { total: 8200, wallet: 3100 }] }, // Current month (Jul)
    ];

    let txnIndex = 1;
    for (const data of monthData) {
      for (let i = 0; i < data.txns.length; i++) {
        const item = data.txns[i];
        const day = 5 + i * 8;
        const txnDate = getDateMonthsAgo(data.monthOffset, day);
        
        const customer = users[i % users.length];
        const seller = sellers[i % sellers.length];
        
        const totalAmount = item.total;
        const walletAmountUsed = item.wallet;
        const amountPaidOnline = totalAmount - walletAmountUsed;

        // Breakdown calculation
        const commissionRate = seller.commissionRate || 0.1;
        const commissionAmount = totalAmount * commissionRate;
        const pgFeeTotal = totalAmount * 0.02;
        const pgFeeTrystopShare = pgFeeTotal * 0.5;
        const pgFeeSellerShare = pgFeeTotal * 0.5;
        const sellerNetPayout = totalAmount - commissionAmount - pgFeeSellerShare;
        const cashbackEarned = amountPaidOnline * 0.05; // 5% cashback

        const transactionId = new Types.ObjectId();
        const cashfreeOrderId = `TS_${customer._id.toString().slice(-6)}_${txnDate.getTime()}`;

        transactionsData.push({
          _id: transactionId,
          customerId: customer._id,
          sellerId: seller._id,
          cashfreeOrderId,
          totalAmount,
          walletAmountUsed,
          amountPaidOnline,
          couponCode: null,
          couponDiscount: 0,
          appliedCommissionRate: commissionRate,
          commissionAmount,
          pgFeeTotal,
          pgFeeTrystopShare,
          pgFeeSellerShare,
          sellerNetPayout,
          cashbackEarned,
          appliedCashbackRate: 0.05,
          paymentStatus: 'paid',
          cashfreePaymentStatus: 'SUCCESS',
          paidAt: txnDate,
          createdAt: txnDate,
          updatedAt: txnDate
        });

        // Wallet transactions
        if (walletAmountUsed > 0) {
          walletTransactionsData.push({
            userId: customer._id,
            amount: walletAmountUsed,
            type: 'debit',
            reason: 'checkout_payment',
            relatedTransactionId: transactionId,
            createdAt: txnDate,
            updatedAt: txnDate
          });
        }
        if (cashbackEarned > 0) {
          walletTransactionsData.push({
            userId: customer._id,
            amount: cashbackEarned,
            type: 'credit',
            reason: 'cashback_earned',
            relatedTransactionId: transactionId,
            createdAt: txnDate,
            updatedAt: txnDate
          });
        }

        txnIndex++;
      }
    }

    await Transaction.insertMany(transactionsData);
    await WalletTransaction.insertMany(walletTransactionsData);
    console.log(`Seeded ${transactionsData.length} transactions and corresponding wallet entries!`);
  }

  console.log('Seed complete!');
  process.exit(0);
}

main().catch(console.error);
