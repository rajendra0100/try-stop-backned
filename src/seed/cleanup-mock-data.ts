import { connect, model, Schema } from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'qa'}` });

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://trystop_qa:RKRptpDy7l1BHo4T@trystopqa.mswlyam.mongodb.net/trystop_qa?appName=trystopqa';

const UserSchema = new Schema({ email: String });
const SellerSchema = new Schema({ email: String });
const TransactionSchema = new Schema({ customerId: Schema.Types.ObjectId, sellerId: Schema.Types.ObjectId });
const WalletTransactionSchema = new Schema({ userId: Schema.Types.ObjectId });

const User = model('User', UserSchema);
const Seller = model('Seller', SellerSchema);
const Transaction = model('Transaction', TransactionSchema);
const WalletTransaction = model('WalletTransaction', WalletTransactionSchema);

async function main() {
  await connect(MONGO_URI);
  console.log('Connected to MongoDB for cleanup...');

  // Identify mock users
  const mockUsers = await User.find({ email: { $regex: '@example.com$' } });
  const mockUserIds = mockUsers.map(u => u._id);
  console.log(`Found ${mockUserIds.length} mock users.`);

  // Identify mock sellers
  const mockSellers = await Seller.find({
    email: {
      $in: [
        'rajesh@vogueapparel.com',
        'manish@urbanwear.com',
        'sanjay@denimhub.com',
        'kabir@footwearworld.com',
        'aditya@ethnicpride.com'
      ]
    }
  });
  const mockSellerIds = mockSellers.map(s => s._id);
  console.log(`Found ${mockSellerIds.length} mock sellers.`);

  // Delete transactions
  if (mockUserIds.length > 0 || mockSellerIds.length > 0) {
    const txnDelete = await Transaction.deleteMany({
      $or: [
        { customerId: { $in: mockUserIds } },
        { sellerId: { $in: mockSellerIds } }
      ]
    });
    console.log(`Deleted ${txnDelete.deletedCount} mock transactions.`);

    // Delete wallet transactions
    const walletDelete = await WalletTransaction.deleteMany({
      userId: { $in: mockUserIds }
    });
    console.log(`Deleted ${walletDelete.deletedCount} mock wallet transactions.`);
  }

  // Delete users
  const userDelete = await User.deleteMany({ _id: { $in: mockUserIds } });
  console.log(`Deleted ${userDelete.deletedCount} mock users.`);

  // Delete sellers
  const sellerDelete = await Seller.deleteMany({ _id: { $in: mockSellerIds } });
  console.log(`Deleted ${sellerDelete.deletedCount} mock sellers.`);

  console.log('Cleanup complete!');
  process.exit(0);
}

main().catch(console.error);
