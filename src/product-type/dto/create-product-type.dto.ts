import { IsNotEmpty, IsString } from 'class-validator';

export class CreateProductTypeDto {
  @IsNotEmpty({ message: 'Product type name is required' })
  @IsString()
  name: string;
}

export class UpdateProductTypeDto {
  @IsNotEmpty()
  @IsString()
  name: string;
}
