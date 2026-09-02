import { connect, model, Schema } from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env configuration
const envFile = `.env.${process.env.NODE_ENV || 'qa'}`;
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://trystop_qa:RKRptpDy7l1BHo4T@trystopqa.mswlyam.mongodb.net/trystop_qa?appName=trystopqa';

const ShopAddressSchema = new Schema({
  fullAddress: { type: String, required: true },
  lat: { type: Number },
  lng: { type: Number },
}, { _id: false });

const SellerSchema = new Schema({
  shopName: { type: String, required: true },
  ownerName: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  phone: { type: String, unique: true },
  password: { type: String, default: 'mockpassword123' },
  shopLogoUrl: { type: String, default: '' },
  shopAddress: { type: ShopAddressSchema },
  categories: { type: [String], default: [] },
  verificationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  commissionRate: { type: Number, default: 0.1 },
  role: { type: String, default: 'seller' },
  cashfreeVendorId: { type: String, default: null },
  cashfreeVendorStatus: { type: String, default: 'not_registered' },
  avgRating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  rankingScore: { type: Number, default: 0 },
  onlineTxnVolume30d: { type: Number, default: 0 },
  fcmToken: { type: String, default: null },
  offerTags: { type: [String], default: [] },
  discountPercent: { type: Number, default: 0 },
}, { timestamps: true });

const BannerSchema = new Schema({
  title: { type: String, required: true },
  imageUrl: { type: String, required: true },
  linkUrl: { type: String, default: '' },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  startsAt: { type: Date },
  endsAt: { type: Date },
  targetType: { type: String, enum: ['seller_list', 'category', 'external_link', 'none'], default: 'none' },
  targetFilter: {
    type: {
      categories: [String],
      offerTag: String,
      minDiscount: Number,
      verificationStatus: String,
    },
    default: null,
  },
  targetCategorySlug: { type: String, default: null },
}, { timestamps: true });

const CategorySchema = new Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  parentCategoryId: { type: Schema.Types.ObjectId, default: null },
  icon: { type: String, default: '' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const Seller = model('Seller', SellerSchema);
const Banner = model('Banner', BannerSchema);
const Category = model('Category', CategorySchema);

async function main() {
  console.log(`Connecting to MongoDB... (${MONGO_URI})`);
  await connect(MONGO_URI);
  console.log('Connected!');

  // 0. Clear and Seed Categories (proper hierarchy: Main → Subcategories)
  console.log('Clearing existing categories...');
  await Category.deleteMany({});
  
  // Step 1: Create main demographic categories (top-level parents)
  const mainCategories = [
    { name: 'Men', slug: 'men', isActive: true },
    { name: 'Women', slug: 'women', isActive: true },
    { name: 'Kids', slug: 'kids', isActive: true },
    { name: 'Unisex', slug: 'unisex', isActive: true },
  ];
  const insertedMains = await Category.insertMany(mainCategories);
  console.log(`Seeded ${insertedMains.length} main categories!`);

  // Step 2: Create style subcategories under EACH main category
  const styleTypes = ['Casual', 'Formal', 'Ethnic', 'Traditional', 'Premium'];
  const subcategories: any[] = [];
  for (const parent of insertedMains) {
    for (const style of styleTypes) {
      subcategories.push({
        name: style,
        slug: `${(parent as any).slug}-${style.toLowerCase()}`, // e.g. men-casual, women-formal, men-premium
        parentCategoryId: (parent as any)._id,
        isActive: true,
      });
    }
  }
  await Category.insertMany(subcategories);
  console.log(`Seeded ${subcategories.length} subcategories (${styleTypes.length} styles × ${insertedMains.length} parents)!`);

  // 1. Delete and Re-Seed Sellers
  console.log('Clearing existing sellers...');
  await Seller.deleteMany({});
  console.log('Cleared!');

  // Accurate coordinates in Jaipur:
  // Mansarovar Plaza: lat: 26.853047, lng: 75.761094
  // Raja Park (Gali No 4): lat: 26.892435, lng: 75.831526
  // C-Scheme (Panch Batti): lat: 26.911245, lng: 75.801012
  const mockSellers = [
    {
      shopName: 'Ethnic Era',
      ownerName: 'Rajesh Sharma',
      email: 'ethnicera@example.com',
      phone: '9829012345',
      shopLogoUrl: 'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=600&auto=format&fit=crop&q=80',
      shopBannerUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&auto=format&fit=crop&q=80',
      shopAddress: {
        fullAddress: 'Shop 14, Mansarovar Plaza, Mansarovar, Jaipur',
        lat: 26.853047,
        lng: 75.761094,
      },
      categories: ['men', 'women', 'ethnic', 'traditional', 'men-ethnic', 'women-ethnic', 'men-traditional', 'women-traditional'],
      avgRating: 4.5,
      reviewCount: 120,
      rankingScore: 85,
      offerTags: ['flat_50_off'],
      discountPercent: 50,
      verificationStatus: 'approved',
    },
    {
      shopName: 'Maison Minimal',
      ownerName: 'Manish Malhotra',
      email: 'maisonminimal@example.com',
      phone: '9829012346',
      shopLogoUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&auto=format&fit=crop&q=80',
      shopBannerUrl: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=800&auto=format&fit=crop&q=80',
      shopAddress: {
        fullAddress: 'Showroom 4, Gali No. 4, Raja Park, Jaipur',
        lat: 26.892435,
        lng: 75.831526,
      },
      categories: ['women', 'casual', 'premium', 'women-casual', 'women-premium'],
      avgRating: 4.3,
      reviewCount: 45,
      rankingScore: 70,
      offerTags: ['flat_30_off'],
      discountPercent: 30,
      verificationStatus: 'approved',
    },
    {
      shopName: 'Thread & Heritage',
      ownerName: 'Aditya Chopra',
      email: 'threadheritage@example.com',
      phone: '9829012347',
      shopLogoUrl: 'https://images.unsplash.com/photo-1479064555552-3ef4979f8908?w=600&auto=format&fit=crop&q=80',
      shopBannerUrl: 'https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?w=800&auto=format&fit=crop&q=80',
      shopAddress: {
        fullAddress: 'Opposite Panch Batti, C-Scheme, Jaipur',
        lat: 26.911245,
        lng: 75.801012,
      },
      categories: ['men', 'women', 'ethnic', 'traditional', 'premium', 'men-ethnic', 'women-ethnic', 'men-traditional', 'women-traditional', 'men-premium', 'women-premium'],
      avgRating: 4.7,
      reviewCount: 88,
      rankingScore: 92,
      offerTags: [],
      discountPercent: 0,
      verificationStatus: 'approved',
    },
    {
      shopName: 'Denim Hub',
      ownerName: 'Sanjay Dutt',
      email: 'denimhub@example.com',
      phone: '9829012348',
      shopLogoUrl: 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=600&auto=format&fit=crop&q=80',
      shopBannerUrl: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=800&auto=format&fit=crop&q=80',
      shopAddress: {
        fullAddress: 'Shop 22, Sector 10, Mansarovar, Jaipur',
        lat: 26.848821,
        lng: 75.758012,
      },
      categories: ['men', 'women', 'casual', 'men-casual', 'women-casual'],
      avgRating: 3.9,
      reviewCount: 32,
      rankingScore: 50,
      offerTags: ['flat_20_off'],
      discountPercent: 20,
      verificationStatus: 'approved',
    },
    {
      shopName: 'Traditional Swag',
      ownerName: 'Kabir Khan',
      email: 'traditionalswag@example.com',
      phone: '9829012349',
      shopLogoUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&auto=format&fit=crop&q=80',
      shopBannerUrl: 'https://images.unsplash.com/photo-1622330229165-27a3c30bc5b7?w=800&auto=format&fit=crop&q=80',
      shopAddress: {
        fullAddress: 'Shop 56, Raja Park Main Market, Raja Park, Jaipur',
        lat: 26.890512,
        lng: 75.833014,
      },
      categories: ['kids', 'traditional', 'ethnic', 'kids-traditional', 'kids-ethnic'],
      avgRating: 4.6,
      reviewCount: 110,
      rankingScore: 80,
      offerTags: ['flat_50_off'],
      discountPercent: 50,
      verificationStatus: 'approved',
    },
    {
      shopName: 'Urban Uniform',
      ownerName: 'Sneha Roy',
      email: 'urbanuniform@example.com',
      phone: '9829012350',
      shopLogoUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&auto=format&fit=crop&q=80',
      shopBannerUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop&q=80',
      shopAddress: {
        fullAddress: 'G-5, Crystal Mall, Bani Park, Jaipur',
        lat: 26.924823,
        lng: 75.791245,
      },
      categories: ['men', 'women', 'casual', 'men-casual', 'women-casual'],
      avgRating: 4.1,
      reviewCount: 22,
      rankingScore: 40,
      offerTags: [],
      discountPercent: 0,
      verificationStatus: 'approved',
    },
  ];

  await Seller.insertMany(mockSellers);
  console.log(`Seeded ${mockSellers.length} sellers with Jaipur locations and discounts!`);

  // 2. Seed Home Banners to link properly
  console.log('Clearing existing banners...');
  await Banner.deleteMany({});
  
  const mockBanners = [
    {
      title: 'Best Sellers & Top Rated',
      imageUrl: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1000&auto=format&fit=crop&q=80',
      order: 1,
      isActive: true,
      targetType: 'seller_list',
      targetFilter: {
        sortBy: 'ranking',
      },
    },
    {
      title: 'Try Nearby (50% Off Sale)',
      imageUrl: 'https://images.unsplash.com/photo-1479064555552-3ef4979f8908?w=1000&auto=format&fit=crop&q=80',
      order: 2,
      isActive: true,
      targetType: 'seller_list',
      targetFilter: {
        minDiscount: 50,
        offerTag: 'flat_50_off',
      },
    },
    {
      title: 'Explore Ethnic Wear Collection',
      imageUrl: 'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=1000&auto=format&fit=crop&q=80',
      order: 3,
      isActive: true,
      targetType: 'seller_list',
      targetFilter: {
        categories: ['ethnic', 'traditional'],
      },
    },
    {
      title: 'Maison Minimal Grand Fest',
      imageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1000&auto=format&fit=crop&q=80',
      order: 4,
      isActive: true,
      targetType: 'seller_list',
      targetFilter: {
        categories: ['premium'],
      },
    },
    {
      title: 'Premium Men Collections',
      imageUrl: 'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=1000&auto=format&fit=crop&q=80',
      order: 5,
      isActive: true,
      targetType: 'seller_list',
      targetCategorySlug: 'men',
      targetFilter: {
        categories: ['men'],
      },
    },
    {
      title: 'Women Designer Outfits',
      imageUrl: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1000&auto=format&fit=crop&q=80',
      order: 6,
      isActive: true,
      targetType: 'seller_list',
      targetCategorySlug: 'women',
      targetFilter: {
        categories: ['women'],
      },
    },
    {
      title: 'Cozy Kids Collections',
      imageUrl: 'https://images.unsplash.com/photo-1519457431-44ccd64a579b?w=1000&auto=format&fit=crop&q=80',
      order: 7,
      isActive: true,
      targetType: 'seller_list',
      targetCategorySlug: 'kids',
      targetFilter: {
        categories: ['kids'],
      },
    },
    {
      title: 'Trendy Unisex Styles',
      imageUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1000&auto=format&fit=crop&q=80',
      order: 8,
      isActive: true,
      targetType: 'seller_list',
      targetCategorySlug: 'unisex',
      targetFilter: {
        categories: ['unisex'],
      },
    },
  ];

  await Banner.insertMany(mockBanners);
  console.log(`Seeded ${mockBanners.length} banners targeting filters successfully!`);

  console.log('\nAll done! Seeder completed.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seeder failed:', err);
  process.exit(1);
});
