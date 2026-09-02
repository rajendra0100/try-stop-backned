import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProductType, ProductTypeDocument } from './schemas/product-type.schema';
import { CreateProductTypeDto, UpdateProductTypeDto } from './dto/create-product-type.dto';

@Injectable()
export class ProductTypeService {
  constructor(
    @InjectModel(ProductType.name)
    private readonly productTypeModel: Model<ProductTypeDocument>,
  ) {}

  private slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-') // Replace spaces with -
      .replace(/[^\w\-]+/g, '') // Remove all non-word chars
      .replace(/\-\-+/g, '-'); // Replace multiple - with single -
  }

  async create(dto: CreateProductTypeDto): Promise<ProductTypeDocument> {
    const slug = this.slugify(dto.name);
    const existing = await this.productTypeModel.findOne({ slug });
    if (existing) {
      throw new ConflictException('Product type already exists');
    }
    return this.productTypeModel.create({
      name: dto.name,
      slug,
    });
  }

  async findAll(): Promise<ProductTypeDocument[]> {
    return this.productTypeModel.find().sort({ name: 1 }).exec();
  }

  async update(id: string, dto: UpdateProductTypeDto): Promise<ProductTypeDocument> {
    const slug = this.slugify(dto.name);
    const existing = await this.productTypeModel.findOne({ slug, _id: { $ne: id } });
    if (existing) {
      throw new ConflictException('Product type name already in use');
    }

    const updated = await this.productTypeModel.findByIdAndUpdate(
      id,
      { name: dto.name, slug },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('Product type not found');
    }
    return updated;
  }

  async remove(id: string): Promise<{ message: string }> {
    const result = await this.productTypeModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException('Product type not found');
    }
    return { message: 'Product type deleted successfully' };
  }
}
