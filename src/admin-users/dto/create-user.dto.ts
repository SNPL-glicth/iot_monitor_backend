import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @IsIn(['admin', 'operator', 'viewer'])
  role!: 'admin' | 'operator' | 'viewer';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
