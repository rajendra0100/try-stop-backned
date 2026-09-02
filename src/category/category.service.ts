import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { AttributeTemplate, AttributeTemplateDocument, AttributeField } from './schemas/attribute-template.schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateAttributeTemplateDto, UpdateAttributeTemplateDto } from './dto/attribute-template.dto';
import { Seller, SellerDocument } from '../auth/schemas/seller.schema';

/**
 * CategoryService — manages the category tree and per-subcategory attribute templates.
 *
 * Categories are fully admin-managed: adding "Sarees" with fields like "Saree Length"
 * is an admin-panel action, not a code change. The seller app calls
 * GET /categories/:subcategoryId/attributes to dynamically render the upload form.
 */
@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(AttributeTemplate.name)
    private readonly templateModel: Model<AttributeTemplateDocument>,
    @InjectModel(Seller.name)
    private readonly sellerModel: Model<SellerDocument>,
  ) {}

  // ─── Category CRUD ──────────────────────────────────────────────────────────

  /**
   * Create a category or subcategory.
   * Auto-generates slug from name. Validates parent exists if parentCategoryId is provided.
   */
  async createCategory(dto: CreateCategoryDto): Promise<CategoryDocument> {
    let parentIds = (dto.parentCategoryIds ?? []).map(id => new Types.ObjectId(id));
    if (parentIds.length === 0 && dto.parentCategoryId) {
      parentIds = [new Types.ObjectId(dto.parentCategoryId)];
    }
    const firstParentId = parentIds.length > 0 ? parentIds[0] : null;

    let parent: CategoryDocument | null = null;
    // Validate parent exists if specified
    if (firstParentId) {
      parent = await this.categoryModel.findById(firstParentId);
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
    }

    const slug = await this.generateUniqueSlug(dto.name, parent);

    const category = await this.categoryModel.create({
      name: dto.name,
      slug,
      parentCategoryId: firstParentId,
      parentCategoryIds: parentIds,
      icon: dto.icon ?? '',
      bgColor: dto.bgColor ?? '#EFF6FF',
      isTrending: dto.isTrending ?? true,
      order: dto.order ?? 0,
      isActive: dto.isActive ?? true,
    });

    this.logger.log(`Category created: ${dto.name} (slug: ${slug})`);
    return category;
  }

  /**
   * Update a category — rename, change icon, update styling, activate/deactivate.
   * Re-generates slug if name changes.
   */
  async updateCategory(id: string, dto: UpdateCategoryDto): Promise<CategoryDocument> {
    const category = await this.categoryModel.findById(id);
    if (!category) throw new NotFoundException('Category not found');

    if (dto.name && dto.name !== category.name) {
      const newSlug = this.generateSlug(dto.name);
      const existingSlug = await this.categoryModel.findOne({ slug: newSlug, _id: { $ne: id } });
      if (existingSlug) {
        throw new ConflictException(`Category with slug '${newSlug}' already exists`);
      }
      category.slug = newSlug;
      category.name = dto.name;
    }

    if (dto.icon !== undefined) category.icon = dto.icon;
    if (dto.bgColor !== undefined) category.bgColor = dto.bgColor;
    if (dto.isTrending !== undefined) category.isTrending = dto.isTrending;
    if (dto.order !== undefined) category.order = dto.order;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;
    if (dto.parentCategoryIds !== undefined) {
      category.parentCategoryIds = dto.parentCategoryIds.map(id => new Types.ObjectId(id));
      category.parentCategoryId = dto.parentCategoryIds.length > 0 ? new Types.ObjectId(dto.parentCategoryIds[0]) : null;
    }

    await category.save();
    this.logger.log(`Category updated: ${category.name}`);
    return category;
  }

  /**
   * Get trending collection categories for the 3D grid display on mobile app.
   */
  async getTrendingCategories(): Promise<CategoryDocument[]> {
    return this.categoryModel
      .find({ isActive: true, isTrending: true })
      .sort({ order: -1, name: 1 })
      .exec();
  }

  /**
   * Delete a category — only if no live products reference it.
   * Product count check will be done by the controller/caller since ProductService
   * lives in a separate module. For now, we delete and let the controller verify.
   */
  async deleteCategory(id: string): Promise<{ message: string }> {
    const category = await this.categoryModel.findById(id);
    if (!category) {
      return { message: 'Category not found or already deleted' };
    }

    // Check if this category has children (subcategories)
    const childCount = await this.categoryModel.countDocuments({ parentCategoryId: id });
    if (childCount > 0) {
      throw new BadRequestException(
        'Cannot delete category with subcategories. Remove subcategories first.',
      );
    }

    await this.categoryModel.deleteOne({ _id: id });
    // Also delete the attribute template if this was a subcategory
    await this.templateModel.deleteOne({ subcategoryId: id });

    // Clean up slug references on sellers
    if (category.slug) {
      await this.sellerModel.updateMany(
        { categories: category.slug },
        { $pull: { categories: category.slug } }
      );
      this.logger.log(`Cleaned up slug '${category.slug}' references from sellers`);
    }

    this.logger.log(`Category deleted: ${category.name}`);
    return { message: `Category '${category.name}' deleted` };
  }

  /**
   * Get the full category + subcategory tree.
   * Returns top-level categories with nested children arrays.
   * Public endpoint — used for category browsing/menu.
   */
  async getCategoryTree(): Promise<any[]> {
    const allCategories = await this.categoryModel
      .find({ isActive: true })
      .sort({ name: 1 })
      .lean();

    // Build tree: top-level categories with nested subcategories
    const topLevel = allCategories.filter((c) => !c.parentCategoryId && (!c.parentCategoryIds || c.parentCategoryIds.length === 0));
    return topLevel.map((parent) => ({
      ...parent,
      subcategories: allCategories.filter(
        (c) =>
          (c.parentCategoryId && c.parentCategoryId.toString() === parent._id.toString()) ||
          (c.parentCategoryIds && c.parentCategoryIds.some((id: any) => id.toString() === parent._id.toString())),
      ),
    }));
  }

  /**
   * Validate that a category ID exists and is active.
   * Used by ProductService when creating a product.
   */
  async validateCategoryExists(categoryId: string): Promise<CategoryDocument> {
    const category = await this.categoryModel.findById(categoryId);
    if (!category) throw new NotFoundException(`Category '${categoryId}' not found`);
    if (!category.isActive) throw new BadRequestException(`Category '${category.name}' is inactive`);
    return category;
  }

  /**
   * Get a category by slug (for URL-based lookups).
   */
  async getCategoryBySlug(slug: string): Promise<CategoryDocument | null> {
    return this.categoryModel.findOne({ slug, isActive: true });
  }

  // ─── Attribute Template CRUD ──────────────────────────────────────────────

  /**
   * Get attribute template for a subcategory.
   * Called by the seller app right after the seller picks a subcategory,
   * to dynamically render the upload form based on the returned fields array.
   */
  async getAttributeTemplate(subcategoryId: string): Promise<AttributeTemplateDocument | null> {
    // Validate the subcategory exists
    const category = await this.categoryModel.findById(subcategoryId);
    if (!category) throw new NotFoundException('Subcategory not found');

    return this.templateModel.findOne({ subcategoryId }).lean();
  }

  /**
   * Create or replace the entire attribute template for a subcategory.
   * Replaces all fields if a template already exists.
   */
  async createOrReplaceAttributeTemplate(
    subcategoryId: string,
    dto: CreateAttributeTemplateDto,
  ): Promise<AttributeTemplateDocument> {
    const category = await this.categoryModel.findById(subcategoryId);
    if (!category) throw new NotFoundException('Subcategory not found');

    const template = await this.templateModel.findOneAndUpdate(
      { subcategoryId },
      { subcategoryId, fields: dto.fields },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    this.logger.log(
      `Attribute template set for subcategory '${category.name}' with ${dto.fields.length} fields`,
    );
    return template;
  }

  /**
   * Partially update fields in an attribute template — add, remove, or update individual fields.
   */
  async updateAttributeTemplate(
    subcategoryId: string,
    dto: UpdateAttributeTemplateDto,
  ): Promise<AttributeTemplateDocument> {
    const template = await this.templateModel.findOne({ subcategoryId });
    if (!template) {
      throw new NotFoundException(
        'Attribute template not found for this subcategory. Create one first with POST.',
      );
    }

    let fields: AttributeField[] = [...template.fields];

    // Remove fields by name
    if (dto.remove?.length) {
      fields = fields.filter((f) => !dto.remove!.includes(f.name));
    }

    // Update fields by name (match by name, replace entirely)
    if (dto.update?.length) {
      for (const updatedField of dto.update) {
        const idx = fields.findIndex((f) => f.name === updatedField.name);
        if (idx !== -1) {
          fields[idx] = {
            name: updatedField.name,
            type: updatedField.type,
            options: updatedField.options ?? [],
            required: updatedField.required ?? false,
          };
        }
      }
    }

    // Add new fields (only if name doesn't already exist)
    if (dto.add?.length) {
      for (const newField of dto.add) {
        const exists = fields.some((f) => f.name === newField.name);
        if (!exists) {
          fields.push({
            name: newField.name,
            type: newField.type,
            options: newField.options ?? [],
            required: newField.required ?? false,
          });
        }
      }
    }

    template.fields = fields;
    await template.save();

    this.logger.log(`Attribute template updated for subcategory ${subcategoryId}`);
    return template;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Generate a URL-friendly slug from a category name */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /** Generate a unique URL-friendly slug, making it parent-aware if under a parent category */
  private async generateUniqueSlug(name: string, parentCategory?: CategoryDocument | null): Promise<string> {
    const baseSlug = this.generateSlug(name);
    const candidate = parentCategory ? `${baseSlug}-${parentCategory.slug}` : baseSlug;

    const existing = await this.categoryModel.findOne({ slug: candidate });
    if (existing) {
      throw new ConflictException(
        `A ${parentCategory ? 'subcategory' : 'category'} with the name "${name}"${parentCategory ? ` under "${parentCategory.name}"` : ''} already exists.`,
      );
    }

    return candidate;
  }
}
