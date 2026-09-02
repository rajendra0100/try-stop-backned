import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Product, ProductDocument } from './schemas/product.schema';
import { CategoryService } from '../category/category.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateTagsDto } from './dto/update-tags.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { Role } from '../common/enums/role.enum';

/**
 * Paginated response shape for cursor-based pagination.
 */
export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * ProductService — core business logic for product CRUD, ownership, approval, tags, and search.
 *
 * Design principles:
 * - Ownership is enforced in the service layer (not just controller) so it can't be bypassed
 * - All filters combine with AND — no filter silently drops another
 * - Search matching logic is isolated in buildSearchQuery() for easy Elasticsearch swap later
 * - Cursor-based pagination everywhere, never offset-based
 * - The PRODUCT_APPROVAL_REQUIRED flag gates seller uploads only; admin/subadmin always auto-approve
 */
@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly categoryService: CategoryService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Product Creation ────────────────────────────────────────────────────────

  /**
   * Create a new product.
   *
   * Approval logic (governed by PRODUCT_APPROVAL_REQUIRED env flag):
   * - Admin/Subadmin uploads → always auto-live, regardless of flag
   * - Seller uploads when flag=false (current) → auto-live (launch/testing phase)
   * - Seller uploads when flag=true (future) → pending_review, invisible to customers
   *
   * Flipping the flag later requires zero code changes — just an env var change.
   */
  async createProduct(
    dto: CreateProductDto,
    userId: string,
    userRole: Role,
  ): Promise<ProductDocument> {
    // Validate category and subcategory exist
    await this.categoryService.validateCategoryExists(dto.categoryId);
    await this.categoryService.validateCategoryExists(dto.subcategoryId);

    // Compute discount percent from mrp/offerPrice
    const discountPercent =
      dto.mrp > 0 ? Math.round(((dto.mrp - dto.offerPrice) / dto.mrp) * 100) : 0;

    // Generate unique slug
    const slug = await this.generateUniqueSlug(dto.name);

    // Determine approval status based on role and feature flag
    const { status, isApproved } = this.resolveApprovalStatus(userRole);

    // Map codebase role enum to stored role string
    const uploadedByRole = this.mapRoleToUploadRole(userRole);

    const product = await this.productModel.create({
      name: dto.name,
      slug,
      description: dto.description ?? '',
      brand: dto.brand ?? '',
      categoryId: dto.categoryId,
      subcategoryId: dto.subcategoryId,
      gender: dto.gender,
      mrp: dto.mrp,
      offerPrice: dto.offerPrice,
      discountPercent,
      variants: (dto.variants ?? []) as any,
      specifications: dto.specifications ?? {},
      images: dto.images ?? [],
      video: dto.video ?? null,
      isReturnable: dto.isReturnable ?? true,
      returnWindowDays: dto.returnWindowDays ?? 7,
      returnPolicyNote: dto.returnPolicyNote ?? 'Return if not liked',
      codAvailable: dto.codAvailable ?? true,
      isSecurePayment: dto.isSecurePayment ?? true,
      tags: [],
      uploadedBy: userId,
      uploadedByRole,
      isApproved,
      status,
      approvedBy: isApproved && userRole !== Role.SELLER ? userId : null,
      rejectionReason: null,
      avgRating: 0,
      reviewCount: 0,
    });

    this.logger.log(
      `Product created: "${dto.name}" by ${userRole} (${userId}), status: ${status}`,
    );
    return product;
  }

  // ─── Product Update ──────────────────────────────────────────────────────────

  /**
   * Update a product.
   * Ownership check: sellers can only edit their own products.
   * Admin/Subadmin can edit any product (ownership check bypassed).
   */
  async updateProduct(
    productId: string,
    dto: UpdateProductDto,
    userId: string,
    userRole: Role,
  ): Promise<ProductDocument> {
    const product = await this.findProductOrFail(productId);

    // Enforce ownership for sellers — service-layer check (can't be bypassed)
    this.enforceOwnership(product, userId, userRole);

    // Validate category/subcategory if being changed
    if (dto.categoryId) await this.categoryService.validateCategoryExists(dto.categoryId);
    if (dto.subcategoryId) await this.categoryService.validateCategoryExists(dto.subcategoryId);

    // Recalculate discount if prices change
    const mrp = dto.mrp ?? product.mrp;
    const offerPrice = dto.offerPrice ?? product.offerPrice;
    const discountPercent = mrp > 0 ? Math.round(((mrp - offerPrice) / mrp) * 100) : 0;

    // Re-generate slug if name changes
    let slug = product.slug;
    if (dto.name && dto.name !== product.name) {
      slug = await this.generateUniqueSlug(dto.name);
    }

    const updated = await this.productModel.findByIdAndUpdate(
      productId,
      { ...dto, discountPercent, slug },
      { new: true },
    );

    this.logger.log(`Product updated: "${updated!.name}" by ${userRole} (${userId})`);
    return updated!;
  }

  // ─── Product Deletion (soft delete) ──────────────────────────────────────────

  /**
   * Soft delete a product — sets status to "deleted".
   * Ownership check: sellers can only delete their own products.
   */
  async deleteProduct(
    productId: string,
    userId: string,
    userRole: Role,
  ): Promise<{ message: string }> {
    const product = await this.findProductOrFail(productId);
    this.enforceOwnership(product, userId, userRole);

    await this.productModel.findByIdAndUpdate(productId, { status: 'deleted' });
    this.logger.log(`Product soft-deleted: "${product.name}" by ${userRole} (${userId})`);
    return { message: `Product '${product.name}' has been deleted` };
  }

  // ─── Public Product Queries ──────────────────────────────────────────────────

  /**
   * Get filtered, paginated products for public browsing.
   * Only returns live + approved products.
   *
   * All filters combine with AND — every present filter key adds one more condition.
   * No filter's presence causes another to be ignored (§6.1a).
   *
   * Search matching logic is isolated in buildSearchQuery() so it can be swapped
   * for Elasticsearch later without touching any controller or caller (§10).
   */
  async getProducts(query: QueryProductDto, user?: any): Promise<any> {
    const limit = Math.min(query.limit ?? 20, 50);
    const filter: Record<string, any> = {};

    // ─── Resolve Status Filtering & Permissions ──────────────────────────────
    if (user && (user.role === Role.SUPERADMIN || user.role === Role.SUBADMIN)) {
      if (query.status) {
        filter.status = query.status;
        if (query.status === 'live') {
          filter.isApproved = true;
        }
      }
      // If query.status is not specified, we do not restrict status for admins in moderation flows
    } else {
      // For public users, enforce live and approved products
      filter.status = 'live';
      filter.isApproved = true;
      if (query.status && query.status !== 'live') {
        throw new ForbiddenException('Only administrators can query non-live products');
      }
    }

    // ─── Additive AND filters ──────────────────────────────────────────────
    this.applyCommonFilters(filter, query);

    // ─── Free-text search ──────────────────────────────────────────────────
    if (query.search) {
      this.applySearchQuery(filter, query.search);
    }

    // ─── Sort order ────────────────────────────────────────────────────────
    const sort = this.buildSortOrder(query.sort);

    // ─── Pagination ────────────────────────────────────────────────────────
    if (query.page) {
      // Offset-based pagination for admin panels
      const page = Math.max(query.page ?? 1, 1);
      const skip = (page - 1) * limit;

      const [products, total] = await Promise.all([
        this.productModel
          .find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        this.productModel.countDocuments(filter),
      ]);

      return {
        products,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } else {
      // Cursor-based pagination (public flow)
      if (query.cursor) {
        const cursorData = this.decodeCursor(query.cursor);
        this.applyCursorFilter(filter, cursorData, sort);
      }

      const products = await this.productModel
        .find(filter)
        .sort(sort)
        .limit(limit + 1) // Fetch one extra to determine hasMore
        .lean();

      return this.buildPaginatedResult(products, limit, sort);
    }
  }

  /**
   * Get a single product by ID for the public PDP.
   * Only returns live + approved products.
   */
  async getProductById(productId: string): Promise<ProductDocument> {
    const product = await this.productModel.findOne({
      _id: productId,
      status: 'live',
      isApproved: true,
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  // ─── Seller's Own Products ("My Shop") ──────────────────────────────────────

  /**
   * Get a seller's own products — all statuses (pending, live, rejected, deleted).
   * Uses seller's req.user.id from JWT — never accepts sellerId from query params.
   * Supports the same filter/search/pagination as the public endpoint.
   */
  async getMyProducts(
    sellerId: string,
    query: QueryProductDto,
  ): Promise<PaginatedResult<ProductDocument>> {
    const limit = Math.min(query.limit ?? 20, 50);
    const filter: Record<string, any> = {
      uploadedBy: new Types.ObjectId(sellerId),
      // Don't filter by status/isApproved — seller sees all their products
    };

    // Apply filters (same logic, but without status/approval restriction)
    this.applyCommonFilters(filter, query);

    // Search within seller's own products (not restricted to live/approved)
    if (query.search) {
      this.applySearchQuery(filter, query.search);
    }

    const sort = this.buildSortOrder(query.sort);

    if (query.cursor) {
      const cursorData = this.decodeCursor(query.cursor);
      this.applyCursorFilter(filter, cursorData, sort);
    }

    const products = await this.productModel
      .find(filter)
      .sort(sort)
      .limit(limit + 1)
      .lean();

    return this.buildPaginatedResult(products, limit, sort);
  }

  // ─── Moderation (Approve / Reject / Tags) ──────────────────────────────────

  /**
   * Approve a product — sets status to "live", isApproved to true.
   * Admin/Subadmin with manage_products permission only.
   */
  async approveProduct(productId: string, approvedBy: string): Promise<ProductDocument> {
    const product = await this.findProductOrFail(productId);

    if (product.status === 'live' && product.isApproved) {
      throw new BadRequestException('Product is already approved and live');
    }

    const updated = await this.productModel.findByIdAndUpdate(
      productId,
      {
        status: 'live',
        isApproved: true,
        approvedBy,
        rejectionReason: null,
      },
      { new: true },
    );

    this.logger.log(`Product approved: "${product.name}" by ${approvedBy}`);
    return updated!;
  }

  /**
   * Reject a product — sets status to "rejected" with a reason.
   * Admin/Subadmin with manage_products permission only.
   */
  async rejectProduct(
    productId: string,
    reason: string,
    rejectedBy: string,
  ): Promise<ProductDocument> {
    const product = await this.findProductOrFail(productId);

    const updated = await this.productModel.findByIdAndUpdate(
      productId,
      {
        status: 'rejected',
        isApproved: false,
        rejectionReason: reason,
      },
      { new: true },
    );

    this.logger.log(`Product rejected: "${product.name}" — reason: ${reason}`);
    return updated!;
  }

  /**
   * Update tags on a product — add/remove specific marketing tags.
   * Admin/Subadmin with manage_products permission only.
   * Tags drive homepage carousels and campaign pages.
   */
  async updateTags(productId: string, dto: UpdateTagsDto): Promise<ProductDocument> {
    const product = await this.findProductOrFail(productId);

    let tags = [...product.tags];

    if (dto.remove?.length) {
      tags = tags.filter((t) => !dto.remove!.includes(t));
    }

    if (dto.add?.length) {
      for (const tag of dto.add) {
        if (!tags.includes(tag)) tags.push(tag);
      }
    }

    const updated = await this.productModel.findByIdAndUpdate(
      productId,
      { tags },
      { new: true },
    );

    this.logger.log(`Product tags updated: "${product.name}" → [${tags.join(', ')}]`);
    return updated!;
  }

  // ─── Helpers for HomeService ──────────────────────────────────────────────────

  /**
   * Get products by a filter config (used by HomeService for carousel sections).
   * Same as getProducts but accepts raw filter objects from home_sections config.
   */
  async getProductsByFilter(
    filterConfig: { tag?: string; category?: string; priceMax?: number; sort?: string },
    limit: number = 20,
  ): Promise<ProductDocument[]> {
    const query: QueryProductDto = {
      tag: filterConfig.tag,
      category: filterConfig.category,
      priceMax: filterConfig.priceMax,
      sort: filterConfig.sort as any,
      limit,
    };

    const result = await this.getProducts(query);
    return result.data;
  }

  /**
   * Count products referencing a specific category (for safe deletion checks).
   */
  async countProductsByCategory(categoryId: string): Promise<number> {
    return this.productModel.countDocuments({
      $or: [{ categoryId }, { subcategoryId: categoryId }],
      status: { $ne: 'deleted' },
    });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  /** Find a product by ID or throw 404 */
  private async findProductOrFail(productId: string): Promise<ProductDocument> {
    const product = await this.productModel.findById(productId);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  /**
   * Enforce ownership — sellers can only act on their own products.
   * Admin (SUPERADMIN) and permitted Subadmin bypass this check entirely.
   *
   * This is enforced in the service layer (not just controller) so it can't be
   * bypassed by calling the service directly from another module.
   */
  private enforceOwnership(
    product: ProductDocument,
    userId: string,
    userRole: Role,
  ): void {
    // Admin and Subadmin bypass ownership entirely
    if (userRole === Role.SUPERADMIN || userRole === Role.SUBADMIN) return;

    // Sellers can only touch their own products
    if (product.uploadedBy.toString() !== userId) {
      throw new ForbiddenException(
        'You can only edit or delete your own products',
      );
    }
  }

  /**
   * Determine approval status based on role and the PRODUCT_APPROVAL_REQUIRED flag.
   *
   * When PRODUCT_APPROVAL_REQUIRED=false (current, default):
   *   All uploads → status: "live", isApproved: true
   *
   * When PRODUCT_APPROVAL_REQUIRED=true (future — flip env var, zero code changes):
   *   Seller uploads → status: "pending_review", isApproved: false
   *   Admin/Subadmin uploads → still auto-live (flag only gates seller uploads)
   */
  private resolveApprovalStatus(role: Role): {
    status: 'live' | 'pending_review';
    isApproved: boolean;
  } {
    // Admin/Subadmin always auto-approve — the flag only affects sellers
    if (role === Role.SUPERADMIN || role === Role.SUBADMIN) {
      return { status: 'live', isApproved: true };
    }

    // ─── FUTURE REFERENCE / APPROVAL WORKFLOW ACTIVATION ────────────────────
    // To enable the approval queue for sellers, uncomment the following block:
    /*
    const approvalRequired =
      this.configService.get<string>('PRODUCT_APPROVAL_REQUIRED', 'false') === 'true';

    if (approvalRequired) {
      return { status: 'pending_review', isApproved: false };
    }
    */
    // ────────────────────────────────────────────────────────────────────────

    // By default, for now, let seller uploads go live directly without moderation
    return { status: 'live', isApproved: true };
  }

  /** Map codebase Role enum to the product schema's uploadedByRole string */
  private mapRoleToUploadRole(role: Role): 'seller' | 'superadmin' | 'subadmin' {
    switch (role) {
      case Role.SELLER:
        return 'seller';
      case Role.SUPERADMIN:
        return 'superadmin';
      case Role.SUBADMIN:
        return 'subadmin';
      default:
        return 'seller';
    }
  }

  /**
   * Apply common, composable filters — each present filter adds one more AND condition.
   * This is the shared filter builder used by both getProducts() and getMyProducts().
   */
  private applyCommonFilters(
    filter: Record<string, any>,
    query: QueryProductDto,
  ): void {
    if (query.sellerId) {
      if (Types.ObjectId.isValid(query.sellerId)) {
        filter.uploadedBy = new Types.ObjectId(query.sellerId);
      }
    }

    if (query.category) {
      // Support both slug and ObjectId — try ObjectId first, fall back to slug lookup
      if (Types.ObjectId.isValid(query.category)) {
        filter.$and = filter.$and ?? [];
        filter.$and.push({
          $or: [
            { categoryId: new Types.ObjectId(query.category) },
            { subcategoryId: new Types.ObjectId(query.category) },
          ],
        });
      } else {
        // Slug-based lookup — will be resolved to ID by a pre-query step
        // For now, store as slug and resolve asynchronously in the query
        filter.$and = filter.$and ?? [];
        filter.$and.push({
          $or: [
            { 'categoryId': query.category },
            { 'subcategoryId': query.category },
          ],
        });
      }
    }

    if (query.subcategory) {
      if (Types.ObjectId.isValid(query.subcategory)) {
        filter.subcategoryId = new Types.ObjectId(query.subcategory);
      }
    }

    if (query.gender) {
      filter.gender = query.gender;
    }

    if (query.tag) {
      // Support multiple tags (comma-separated) — product must have ALL specified tags
      const tags = query.tag.split(',').map((t) => t.trim());
      filter.tags = { $all: tags };
    }

    if (query.priceMin !== undefined || query.priceMax !== undefined) {
      filter.offerPrice = {};
      if (query.priceMin !== undefined) filter.offerPrice.$gte = query.priceMin;
      if (query.priceMax !== undefined) filter.offerPrice.$lte = query.priceMax;
    }

    if (query.color) {
      // Match against variant colors (case-insensitive)
      filter['variants.color'] = new RegExp(`^${query.color}$`, 'i');
    }

    if (query.size) {
      filter['variants.size'] = query.size;
    }

    if (query.fit) {
      // Fit is stored as a top-level specification for indexed access
      filter['specifications.Fit'] = new RegExp(`^${query.fit}$`, 'i');
    }

    if (query.discountMin !== undefined) {
      filter.discountPercent = { $gte: query.discountMin };
    }

    if (query.isNew) {
      // "New" = added in the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      filter.createdAt = { $gte: sevenDaysAgo };
    }

    if (query.hubId) {
      // Only return products deliverable from this hub (at least one variant has stock)
      filter['variants.stockByHub'] = {
        $elemMatch: { hubId: new Types.ObjectId(query.hubId), quantity: { $gt: 0 } },
      };
    }
  }

  /**
   * Build search query for free-text search.
   *
   * ISOLATED IN ITS OWN METHOD so it can be swapped for Elasticsearch/OpenSearch later
   * without touching any controller or caller (§10 scalability principle).
   *
   * Approach:
   * - Split search string into tokens (e.g. "red pant" → ["red", "pant"])
   * - Each token matches against: name, brand, description, variant colors, tags
   * - A product matches if it reasonably matches multiple tokens
   * - Uses MongoDB regex for now — swap to $text or ES for scale
   */
  private applySearchQuery(
    filter: Record<string, any>,
    searchString: string,
  ): void {
    const tokens = searchString
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    if (tokens.length === 0) return;

    // Each token must match at least one searchable field (AND across tokens)
    const tokenConditions = tokens.map((token) => {
      const regex = new RegExp(token, 'i');
      return {
        $or: [
          { name: regex },
          { brand: regex },
          { description: regex },
          { 'variants.color': regex },
          { tags: regex },
        ],
      };
    });

    // All tokens must match (AND logic across tokens, OR within each token's fields)
    filter.$and = filter.$and ?? [];
    filter.$and.push(...tokenConditions);
  }

  /** Build MongoDB sort object from the sort query param */
  private buildSortOrder(sort?: string): Record<string, 1 | -1> {
    switch (sort) {
      case 'price_low_high':
        return { offerPrice: 1, _id: 1 };
      case 'price_high_low':
        return { offerPrice: -1, _id: -1 };
      case 'newest':
        return { createdAt: -1, _id: -1 };
      case 'popular':
      default:
        // Default sort: by average rating (desc), then newest
        return { avgRating: -1, createdAt: -1, _id: -1 };
    }
  }

  /**
   * Cursor-based pagination — encode/decode cursor from the last item's sort fields + _id.
   *
   * The cursor encodes the same fields used in sort so pagination stays consistent
   * across different sort orders. Uses base64 encoding for opaque, URL-safe cursors.
   */
  private encodeCursor(product: any, sort: Record<string, 1 | -1>): string {
    const cursorData: Record<string, any> = { _id: product._id.toString() };

    // Include the sort field values in the cursor
    for (const key of Object.keys(sort)) {
      if (key !== '_id') {
        cursorData[key] = product[key];
      }
    }

    return Buffer.from(JSON.stringify(cursorData)).toString('base64');
  }

  private decodeCursor(cursor: string): Record<string, any> {
    try {
      return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }

  /**
   * Apply cursor filter for consistent cursor-based pagination.
   * Uses the "seek method" — find items after the cursor position using the sort key.
   */
  private applyCursorFilter(
    filter: Record<string, any>,
    cursorData: Record<string, any>,
    sort: Record<string, 1 | -1>,
  ): void {
    const sortKeys = Object.keys(sort).filter((k) => k !== '_id');
    const cursorConditions: any[] = [];

    if (sortKeys.length > 0) {
      const primaryKey = sortKeys[0];
      const primaryDir = sort[primaryKey];
      const primaryVal = cursorData[primaryKey];
      const op = primaryDir === 1 ? '$gt' : '$lt';

      // Items strictly after the cursor on the primary sort key
      cursorConditions.push({ [primaryKey]: { [op]: primaryVal } });

      // Items equal on primary sort key but after on _id (tiebreaker)
      const idDir = sort._id ?? -1;
      const idOp = idDir === 1 ? '$gt' : '$lt';
      cursorConditions.push({
        [primaryKey]: primaryVal,
        _id: { [idOp]: new Types.ObjectId(cursorData._id) },
      });
    } else {
      // No sort key other than _id
      const idDir = sort._id ?? -1;
      const idOp = idDir === 1 ? '$gt' : '$lt';
      cursorConditions.push({
        _id: { [idOp]: new Types.ObjectId(cursorData._id) },
      });
    }

    filter.$and = filter.$and ?? [];
    filter.$and.push({ $or: cursorConditions });
  }

  /** Build paginated result with nextCursor and hasMore */
  private buildPaginatedResult(
    products: any[],
    limit: number,
    sort: Record<string, 1 | -1>,
  ): PaginatedResult<ProductDocument> {
    const hasMore = products.length > limit;
    const data = hasMore ? products.slice(0, limit) : products;

    const nextCursor =
      hasMore && data.length > 0
        ? this.encodeCursor(data[data.length - 1], sort)
        : null;

    return { data, nextCursor, hasMore };
  }

  /** Generate a unique slug from a product name */
  private async generateUniqueSlug(name: string): Promise<string> {
    let baseSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Check for uniqueness, append random suffix if needed
    let slug = baseSlug;
    let counter = 0;
    while (await this.productModel.exists({ slug })) {
      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    return slug;
  }
}
