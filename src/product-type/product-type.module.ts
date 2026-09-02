import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductTypeController } from './product-type.controller';
import { ProductTypeService } from './product-type.service';
import { ProductType, ProductTypeSchema } from './schemas/product-type.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ProductType.name, schema: ProductTypeSchema }]),
  ],
  controllers: [ProductTypeController],
  providers: [ProductTypeService],
  exports: [ProductTypeService],
})
export class ProductTypeModule {}
