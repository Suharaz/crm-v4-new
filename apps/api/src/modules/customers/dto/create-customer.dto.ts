import { IsString, IsOptional, IsEmail } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  phone!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  assignedDepartmentId?: string;
}
