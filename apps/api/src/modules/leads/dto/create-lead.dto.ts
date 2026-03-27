import { IsString, IsOptional, IsEmail } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  phone!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  productId?: string;
}
