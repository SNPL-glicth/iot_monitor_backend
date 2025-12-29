import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  @IsIn(['admin', 'operator', 'viewer'])
  role?: 'admin' | 'operator' | 'viewer';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
