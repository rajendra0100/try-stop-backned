import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ProductTypeService } from './product-type.service';
import { CreateProductTypeDto, UpdateProductTypeDto } from './dto/create-product-type.dto';
import { RequirePermission } from '../common/guards/permission.guard';

@Controller('product-types')
export class ProductTypeController {
  constructor(private readonly productTypeService: ProductTypeService) {}

  @Post()
  @RequirePermission('manage_catalog')
  async create(@Body() dto: CreateProductTypeDto) {
    return this.productTypeService.create(dto);
  }

  @Get()
  async findAll() {
    return this.productTypeService.findAll();
  }

  @Patch(':id')
  @RequirePermission('manage_catalog')
  async update(@Param('id') id: string, @Body() dto: UpdateProductTypeDto) {
    return this.productTypeService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('manage_catalog')
  async remove(@Param('id') id: string) {
    return this.productTypeService.remove(id);
  }
}
