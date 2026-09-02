/**
 * Seed script — run with: npx ts-node src/seed/seed.ts
 * Seeds categories, attribute templates, filter options, and home sections.
 * Safe to run multiple times — uses upsert where possible.
 */
import { connect, model, Schema, Types } from 'mongoose';
import * as dotenv from 'dotenv';
import { seedPlatformConfig } from './seed-platform-config';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'qa'}` });

const CategorySchema = new Schema({ name: String, slug: String, parentCategoryId: { type: Schema.Types.ObjectId, default: null }, icon: String, isActive: { type: Boolean, default: true } }, { timestamps: true });
const AttrTemplateSchema = new Schema({ subcategoryId: Schema.Types.ObjectId, fields: [{ name: String, type: { type: String }, options: [String], required: Boolean }] }, { timestamps: true });
const FilterOptionSchema = new Schema({ key: { type: String, unique: true }, label: String, widget: String, options: [{ value: String, label: String, hex: String }], min: Number, max: Number, applicableCategories: [String] }, { timestamps: true });
const HomeSectionSchema = new Schema({ type: String, title: String, filter: { tag: String, category: String, priceMax: Number, sort: String }, style: String, order: Number, isActive: { type: Boolean, default: true } }, { timestamps: true });

const Category = model('Category', CategorySchema);
const AttrTemplate = model('AttributeTemplate', AttrTemplateSchema);
const FilterOption = model('FilterOption', FilterOptionSchema);
const HomeSection = model('HomeSection', HomeSectionSchema);

const PlatformConfigSchema = new Schema({ key: { type: String, unique: true }, value: Number, description: String }, { timestamps: true });
const AdPricingConfigSchema = new Schema({ type: { type: String, unique: true }, pricePerDay: Number }, { timestamps: true });
const CashbackConfigSchema = new Schema({ scope: String, userId: { type: Schema.Types.ObjectId, default: null }, cashbackRate: Number, validFrom: Date, validTill: Date, isActive: Boolean }, { timestamps: true });

const PlatformConfig = model('PlatformConfig', PlatformConfigSchema);
const AdPricingConfig = model('AdPricingConfig', AdPricingConfigSchema);
const CashbackConfig = model('CashbackConfig', CashbackConfigSchema);

// ─── Common attribute fields (reused across subcategories) ─────────────────
const COMMON_APPAREL = [
  { name: 'Brand', type: 'text', options: [], required: true },
  { name: 'Fit', type: 'select', options: ['Slim', 'Regular', 'Relaxed', 'Oversized'], required: true },
  { name: 'Pattern', type: 'select', options: ['Solid', 'Printed', 'Striped', 'Graphic', 'Checked', 'Embroidered', 'Self-Design'], required: false },
  { name: 'Fabric', type: 'text', options: [], required: true },
  { name: 'Fabric Composition', type: 'text', options: [], required: false },
  { name: 'Wash Care', type: 'text', options: [], required: false },
  { name: 'Occasion', type: 'select', options: ['Casual', 'Formal', 'Party', 'Sports', 'Ethnic', 'Lounge'], required: false },
  { name: 'Country of Origin', type: 'text', options: [], required: true },
  { name: 'Package Contains', type: 'text', options: [], required: false },
];
const TOPS_FIELDS = [
  { name: 'Sleeve', type: 'select', options: ['Short', 'Long', 'Sleeveless', '3/4th', 'Roll-Up'], required: true },
  { name: 'Sleeve Length', type: 'text', options: [], required: false },
  { name: 'Neckline', type: 'select', options: ['Round', 'V-Neck', 'Collar', 'Crew', 'Mandarin', 'Boat', 'Square', 'Scoop'], required: true },
  { name: 'Length', type: 'select', options: ['Regular', 'Crop', 'Long', 'Hip Length'], required: false },
  { name: 'Style Type', type: 'text', options: [], required: false },
  { name: 'Transparency', type: 'select', options: ['Opaque', 'Semi-Sheer', 'Sheer'], required: false },
];
const BOTTOM_FIELDS = [
  { name: 'Rise', type: 'select', options: ['High', 'Mid', 'Low'], required: true },
  { name: 'Waist Line', type: 'select', options: ['Regular', 'High', 'Low'], required: false },
  { name: 'Stretchable', type: 'boolean', options: [], required: false },
  { name: 'Closure Type', type: 'select', options: ['Zip', 'Button', 'Drawstring', 'Elastic'], required: false },
  { name: 'Ankle Type', type: 'select', options: ['Straight', 'Tapered', 'Flared', 'Skinny'], required: false },
];
const DRESS_FIELDS = [
  { name: 'Hemline', type: 'select', options: ['Straight', 'A-Line', 'Asymmetric', 'Flared', 'High-Low'], required: false },
  { name: 'Waist Line', type: 'select', options: ['Regular', 'Empire', 'Drop'], required: false },
  { name: 'Dress Length', type: 'select', options: ['Mini', 'Midi', 'Maxi', 'Knee-Length'], required: true },
  { name: 'Sleeve Type', type: 'select', options: ['Short', 'Long', 'Sleeveless', 'Puff', 'Cap'], required: true },
  { name: 'Neckline', type: 'select', options: ['Round', 'V-Neck', 'Square', 'Off-Shoulder', 'Halter', 'Sweetheart'], required: true },
  { name: 'Pockets', type: 'boolean', options: [], required: false },
];
const INNERWEAR_FIELDS = [
  { name: 'Fabric Composition', type: 'text', options: [], required: true },
  { name: 'Closure Type', type: 'select', options: ['Hook', 'Front-Open', 'Slip-On'], required: false },
  { name: 'Padding', type: 'select', options: ['Yes', 'No', 'Removable'], required: true },
  { name: 'Wire Type', type: 'select', options: ['Wired', 'Non-Wired'], required: true },
  { name: 'Strap Type', type: 'select', options: ['Regular', 'Multiway', 'Strapless', 'Racerback'], required: false },
];
const FOOTWEAR_FIELDS = [
  { name: 'Sole Material', type: 'text', options: [], required: false },
  { name: 'Heel Height', type: 'text', options: [], required: false },
  { name: 'Closure Type', type: 'select', options: ['Lace-Up', 'Slip-On', 'Velcro', 'Buckle', 'Zip'], required: false },
  { name: 'Toe Shape', type: 'select', options: ['Round', 'Pointed', 'Square', 'Open'], required: false },
];
const MODEL_FIELDS = [
  { name: 'Model Height', type: 'text', options: [], required: false },
  { name: 'Model Chest Size', type: 'text', options: [], required: false },
  { name: 'Size Worn by Model', type: 'text', options: [], required: false },
  { name: 'USP', type: 'text', options: [], required: false },
];

async function seed() {
  await connect(process.env.MONGO_URI!);
  console.log('Connected to MongoDB');

  // ─── 1. Categories ────────────────────────────────────────────────────────
  const topLevels = [
    { name: 'Men', slug: 'men' }, { name: 'Women', slug: 'women' },
    { name: 'Kids', slug: 'kids' }, { name: 'Unisex', slug: 'unisex' },
  ];
  const parentMap: Record<string, any> = {};
  for (const tl of topLevels) {
    const cat = await Category.findOneAndUpdate({ slug: tl.slug }, { ...tl, parentCategoryId: null, icon: '', isActive: true }, { upsert: true, new: true });
    parentMap[tl.slug] = cat._id;
  }

  const subcategories = [
    { name: 'T-Shirts', slug: 't-shirts', parents: ['men', 'women', 'kids', 'unisex'] },
    { name: 'Shirts', slug: 'shirts', parents: ['men', 'women'] },
    { name: 'Jeans', slug: 'jeans', parents: ['men', 'women', 'kids'] },
    { name: 'Trousers', slug: 'trousers', parents: ['men', 'women'] },
    { name: 'Shorts', slug: 'shorts', parents: ['men', 'women', 'kids'] },
    { name: 'Dresses', slug: 'dresses', parents: ['women'] },
    { name: 'Maxi Dresses', slug: 'maxi-dresses', parents: ['women'] },
    { name: 'Sarees', slug: 'sarees', parents: ['women'] },
    { name: 'Kurtis', slug: 'kurtis', parents: ['women'] },
    { name: 'Lehengas', slug: 'lehengas', parents: ['women'] },
    { name: 'Blazers & Coats', slug: 'blazers-coats', parents: ['men', 'women'] },
    { name: 'Ethnic Sets', slug: 'ethnic-sets', parents: ['men', 'women'] },
    { name: 'Innerwear & Bras', slug: 'innerwear-bras', parents: ['women'] },
    { name: 'Nightwear', slug: 'nightwear', parents: ['men', 'women'] },
    { name: 'Activewear', slug: 'activewear', parents: ['men', 'women', 'unisex'] },
    { name: 'Sneakers', slug: 'sneakers', parents: ['men', 'women', 'unisex'] },
    { name: 'Heels', slug: 'heels', parents: ['women'] },
    { name: 'Flats', slug: 'flats', parents: ['women'] },
    { name: 'Sandals', slug: 'sandals', parents: ['men', 'women', 'kids'] },
    { name: 'Bags', slug: 'bags', parents: ['men', 'women', 'unisex'] },
    { name: 'Jewellery', slug: 'jewellery', parents: ['women', 'unisex'] },
    { name: 'Watches', slug: 'watches', parents: ['men', 'women', 'unisex'] },
    { name: 'Belts', slug: 'belts', parents: ['men', 'women'] },
  ];

  const subMap: Record<string, any> = {};
  for (const sub of subcategories) {
    const parentId = parentMap[sub.parents[0]];
    const cat = await Category.findOneAndUpdate({ slug: sub.slug }, { name: sub.name, slug: sub.slug, parentCategoryId: parentId, icon: '', isActive: true }, { upsert: true, new: true });
    subMap[sub.slug] = cat._id;
  }
  console.log(`Seeded ${topLevels.length} top-level + ${subcategories.length} subcategories`);

  // ─── 2. Attribute Templates ───────────────────────────────────────────────
  const templateMap: Record<string, any[]> = {
    't-shirts': [...COMMON_APPAREL, ...TOPS_FIELDS, ...MODEL_FIELDS],
    'shirts': [...COMMON_APPAREL, ...TOPS_FIELDS, ...MODEL_FIELDS],
    'jeans': [...COMMON_APPAREL, ...BOTTOM_FIELDS, ...MODEL_FIELDS],
    'trousers': [...COMMON_APPAREL, ...BOTTOM_FIELDS, ...MODEL_FIELDS],
    'shorts': [...COMMON_APPAREL, ...BOTTOM_FIELDS, ...MODEL_FIELDS],
    'dresses': [...COMMON_APPAREL, ...DRESS_FIELDS, ...MODEL_FIELDS],
    'maxi-dresses': [...COMMON_APPAREL, ...DRESS_FIELDS, ...MODEL_FIELDS],
    'sarees': [...COMMON_APPAREL, { name: 'Saree Length', type: 'text', options: [], required: false }, { name: 'Blouse Included', type: 'boolean', options: [], required: true }, ...MODEL_FIELDS],
    'kurtis': [...COMMON_APPAREL, ...TOPS_FIELDS, ...MODEL_FIELDS],
    'lehengas': [...COMMON_APPAREL, ...DRESS_FIELDS, { name: 'Dupatta Included', type: 'boolean', options: [], required: false }, ...MODEL_FIELDS],
    'blazers-coats': [...COMMON_APPAREL, ...TOPS_FIELDS, ...MODEL_FIELDS],
    'ethnic-sets': [...COMMON_APPAREL, { name: 'Set Contents', type: 'text', options: [], required: true }, ...MODEL_FIELDS],
    'innerwear-bras': [...INNERWEAR_FIELDS, ...MODEL_FIELDS],
    'nightwear': [...COMMON_APPAREL, ...TOPS_FIELDS, ...MODEL_FIELDS],
    'activewear': [...COMMON_APPAREL, ...TOPS_FIELDS, ...MODEL_FIELDS],
    'sneakers': [...COMMON_APPAREL.filter(f => f.name !== 'Fit'), ...FOOTWEAR_FIELDS],
    'heels': [...COMMON_APPAREL.filter(f => f.name !== 'Fit'), ...FOOTWEAR_FIELDS],
    'flats': [...COMMON_APPAREL.filter(f => f.name !== 'Fit'), ...FOOTWEAR_FIELDS],
    'sandals': [...COMMON_APPAREL.filter(f => f.name !== 'Fit'), ...FOOTWEAR_FIELDS],
  };

  for (const [slug, fields] of Object.entries(templateMap)) {
    if (subMap[slug]) {
      await AttrTemplate.findOneAndUpdate({ subcategoryId: subMap[slug] }, { subcategoryId: subMap[slug], fields }, { upsert: true, new: true });
    }
  }
  console.log(`Seeded ${Object.keys(templateMap).length} attribute templates`);

  // ─── 3. Filter Options ────────────────────────────────────────────────────
  const filters = [
    { key: 'color', label: 'Color', widget: 'swatch', options: [
      { value: 'black', label: 'Black', hex: '#000000' }, { value: 'white', label: 'White', hex: '#FFFFFF' },
      { value: 'red', label: 'Red', hex: '#E53935' }, { value: 'blue', label: 'Blue', hex: '#1E88E5' },
      { value: 'green', label: 'Green', hex: '#43A047' }, { value: 'yellow', label: 'Yellow', hex: '#FDD835' },
      { value: 'pink', label: 'Pink', hex: '#EC407A' }, { value: 'navy', label: 'Navy', hex: '#1A237E' },
      { value: 'grey', label: 'Grey', hex: '#9E9E9E' }, { value: 'brown', label: 'Brown', hex: '#795548' },
      { value: 'maroon', label: 'Maroon', hex: '#880E4F' }, { value: 'beige', label: 'Beige', hex: '#F5F5DC' },
      { value: 'orange', label: 'Orange', hex: '#FF9800' }, { value: 'purple', label: 'Purple', hex: '#7B1FA2' },
    ], applicableCategories: [] },
    { key: 'gender', label: 'Gender', widget: 'chips', options: [
      { value: 'men', label: 'Men' }, { value: 'women', label: 'Women' },
      { value: 'kids', label: 'Kids' }, { value: 'unisex', label: 'Unisex' },
    ], applicableCategories: [] },
    { key: 'size', label: 'Size', widget: 'chips', options: [
      { value: 'XS', label: 'XS' }, { value: 'S', label: 'S' }, { value: 'M', label: 'M' },
      { value: 'L', label: 'L' }, { value: 'XL', label: 'XL' }, { value: 'XXL', label: 'XXL' },
      { value: '3XL', label: '3XL' },
    ], applicableCategories: [] },
    { key: 'fit', label: 'Fit', widget: 'chips', options: [
      { value: 'slim', label: 'Slim' }, { value: 'regular', label: 'Regular' },
      { value: 'relaxed', label: 'Relaxed' }, { value: 'oversized', label: 'Oversized' },
    ], applicableCategories: [] },
    { key: 'price', label: 'Price', widget: 'range', options: [], min: 0, max: 5000, applicableCategories: [] },
    { key: 'discount', label: 'Discount', widget: 'chips', options: [
      { value: '10', label: '10% or more' }, { value: '20', label: '20% or more' },
      { value: '30', label: '30% or more' }, { value: '40', label: '40% or more' },
      { value: '50', label: '50% or more' },
    ], applicableCategories: [] },
  ];
  for (const f of filters) {
    await FilterOption.findOneAndUpdate({ key: f.key }, f, { upsert: true, new: true });
  }
  console.log(`Seeded ${filters.length} filter options`);

  // ─── 4. Home Sections ─────────────────────────────────────────────────────
  const homeSections = [
    { type: 'banner_carousel', title: null, filter: null, style: 'banner_full', order: 1, isActive: true },
    { type: 'category_grid', title: 'Shop by Category', filter: null, style: 'grid_2col', order: 2, isActive: true },
    { type: 'product_carousel', title: 'Steal Drops', filter: { tag: 'steal_drops' }, style: 'strip', order: 3, isActive: true },
    { type: 'product_carousel', title: 'Trending Now', filter: { tag: 'trending', sort: 'popular' }, style: 'strip', order: 4, isActive: true },
    { type: 'deal_strip', title: 'Super Deals', filter: { tag: 'super_deal' }, style: 'deal_timer', order: 5, isActive: true },
    { type: 'product_carousel', title: 'New Arrivals', filter: { sort: 'newest' }, style: 'strip', order: 6, isActive: true },
    { type: 'product_carousel', title: 'Under ₹999', filter: { priceMax: 999 }, style: 'grid_2col', order: 7, isActive: true },
  ];
  await HomeSection.deleteMany({});
  await HomeSection.insertMany(homeSections);
  console.log(`Seeded ${homeSections.length} home sections`);

  // Seed new payment/wallet/category configs
  const PopularSearch = model('PopularSearch', new Schema({}, { strict: false }));
  await seedPlatformConfig(PlatformConfig, AdPricingConfig, CashbackConfig, PopularSearch, Category);

  console.log('\n✅ Seed complete!');
  process.exit(0);
}

seed().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
