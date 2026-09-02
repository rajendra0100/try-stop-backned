import { Model } from 'mongoose';

/**
 * Seeds default platform configuration values.
 *
 * Call this from your existing seed script to initialize:
 *   - commission_rate: 0.15 (15%)
 *   - wallet_usage_cap: 0.75 (75%)
 *   - pg_fee_rate: 0.02 (2%)
 *
 * Also seeds default ad pricing:
 *   - shop: ₹50/day
 *   - product: ₹25/day
 *
 * And a default global cashback config:
 *   - 10% cashback rate
 *
 * Uses upsert — safe to run multiple times without duplicating data.
 */
export async function seedPlatformConfig(
  platformConfigModel: Model<any>,
  adPricingModel: Model<any>,
  cashbackConfigModel: Model<any>,
  popularSearchModel?: Model<any>,
  categoryModel?: Model<any>,
): Promise<void> {
  console.log('🌱 Seeding platform configuration...');

  // ─── Platform Config ───────────────────────────────────────────────────────
  const configs = [
    {
      key: 'commission_rate',
      value: 0.15,
      description: 'Global default commission rate (15%). Overridden by seller-specific commissionRate.',
    },
    {
      key: 'wallet_usage_cap',
      value: 0.75,
      description: 'Max percentage of a bill that can be covered by wallet (75%). Overridden by user-specific walletUsageCap.',
    },
    {
      key: 'pg_fee_rate',
      value: 0.02,
      description: 'Payment gateway fee rate (2%).',
    },
  ];

  for (const cfg of configs) {
    await platformConfigModel.findOneAndUpdate(
      { key: cfg.key },
      { $setOnInsert: cfg },
      { upsert: true },
    );
    console.log(`  ✅ Config seeded: ${cfg.key} = ${cfg.value}`);
  }

  // ─── Default Ad Pricing ────────────────────────────────────────────────────
  const adPricings = [
    { type: 'shop', pricePerDay: 50, isActive: true },
    { type: 'product', pricePerDay: 25, isActive: true },
  ];

  for (const ad of adPricings) {
    await adPricingModel.findOneAndUpdate(
      { type: ad.type },
      { $setOnInsert: ad },
      { upsert: true },
    );
    console.log(`  ✅ Ad pricing seeded: ${ad.type} = ₹${ad.pricePerDay}/day`);
  }

  // ─── Default Global Cashback Config ───────────────────────────────────────
  const existingGlobal = await cashbackConfigModel.findOne({ scope: 'global' });
  if (!existingGlobal) {
    await cashbackConfigModel.create({
      scope: 'global',
      cashbackRate: 0.10, // 10%
      minOrderAmount: 0,
      maxCashbackPerOrder: null,
      validFrom: new Date(),
      validTill: null,
      isActive: true,
    });
    console.log('  ✅ Default global cashback rate: 10%');
  } else {
    console.log(`  ✅ Global cashback already set: ${existingGlobal.cashbackRate * 100}%`);
  }

  // ─── Default Fallback Popular Searches ───────────────────────────────────────
  if (popularSearchModel) {
    const defaultFallbacks = [
      'Ethnic Wear',
      'Casual Wear',
      'Traditional',
      'Footwear',
      'Fast Food',
      'Denim Hub',
      'Fashion',
      'Supermarket',
    ];

    for (const item of defaultFallbacks) {
      await popularSearchModel.findOneAndUpdate(
        { normalizedKeyword: item.toLowerCase() },
        {
          $setOnInsert: {
            keyword: item,
            normalizedKeyword: item.toLowerCase(),
            searchCount: 1,
            isPinned: false,
            isFallback: true,
            isBlocked: false,
            priority: 0,
            lastSearchedAt: new Date(),
          },
        },
        { upsert: true },
      );
      console.log(`  ✅ Fallback keyword seeded: ${item}`);
    }
  }

  // ─── Default Categories with 3D Pop Icons ─────────────────────────────────────
  if (categoryModel) {
    const rootCategories = [
      { name: 'Men', order: 1 },
      { name: 'Women', order: 2 },
      { name: 'Kids', order: 3 },
      { name: 'Unisex', order: 4 },
    ];

    const rootMap: Record<string, any> = {};

    for (const root of rootCategories) {
      const slug = root.name.toLowerCase();
      const existing = await categoryModel.findOneAndUpdate(
        { slug },
        {
          $setOnInsert: {
            name: root.name,
            slug,
            order: root.order,
            isTrending: false,
            isActive: true,
            parentCategoryId: null,
          },
        },
        { upsert: true, new: true },
      );
      rootMap[root.name.toLowerCase()] = existing._id;
    }

    const subCategories = [
      // Men subcategories
      { parent: 'men', name: 'Casual Wear', icon: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80', bgColor: '#E0F2FE', order: 10 },
      { parent: 'men', name: 'Ethnic Wear', icon: 'https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=600&auto=format&fit=crop&q=80', bgColor: '#FEF3C7', order: 9 },
      { parent: 'men', name: 'Denim Hub', icon: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=600&auto=format&fit=crop&q=80', bgColor: '#FFF7ED', order: 8 },
      { parent: 'men', name: 'Suits', icon: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600&auto=format&fit=crop&q=80', bgColor: '#ECFDF5', order: 7 },

      // Women subcategories
      { parent: 'women', name: 'Saree', icon: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop&q=80', bgColor: '#FEE2E2', order: 10 },
      { parent: 'women', name: 'Traditional', icon: 'https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=600&auto=format&fit=crop&q=80', bgColor: '#F3E8FF', order: 9 },
      { parent: 'women', name: 'Casual Wear', icon: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&auto=format&fit=crop&q=80', bgColor: '#EFF6FF', order: 8 },

      // Kids subcategories
      { parent: 'kids', name: 'Footwear', icon: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&auto=format&fit=crop&q=80', bgColor: '#FEE2E2', order: 10 },
      { parent: 'kids', name: 'Fast Food', icon: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=600&auto=format&fit=crop&q=80', bgColor: '#ECFDF5', order: 9 },
      { parent: 'kids', name: 'Supermarket', icon: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=600&auto=format&fit=crop&q=80', bgColor: '#FAF5FF', order: 8 },
    ];

    for (const sub of subCategories) {
      const parentId = rootMap[sub.parent.toLowerCase()];
      const slug = `${sub.name.toLowerCase().replace(/\s+/g, '-')}-${sub.parent}`;
      await categoryModel.findOneAndUpdate(
        { slug },
        {
          $setOnInsert: {
            name: sub.name,
            slug,
            icon: sub.icon,
            bgColor: sub.bgColor,
            order: sub.order,
            isTrending: true,
            isActive: true,
            parentCategoryId: parentId,
          },
        },
        { upsert: true },
      );
    }
  }

  console.log('🌱 Platform configuration seeded successfully!');
}
